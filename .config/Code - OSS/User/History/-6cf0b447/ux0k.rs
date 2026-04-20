// ABOUTME: Implements B-tree nodes for efficient row storage and retrieval.
// ABOUTME: Supports dynamic fanout with split operations for overflow.

use crate::storage::page::PAGE_SIZE;

const TEST_MAX_KEYS: usize = (PAGE_SIZE - 16) / 16;

// const TEST_MAX_KEYS: usize = 10;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BtreeNodeType {
    Leaf,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BtreeNode {
    pub node_type: BtreeNodeType,
    pub key_count: usize,
    pub keys: Vec<u64>,
    pub pointers: Vec<u64>,
}

impl BtreeNode {
    pub fn new(node_type: BtreeNodeType) -> Self {
        BtreeNode {
            node_type,
            key_count: 0,
            keys: Vec::new(),
            pointers: Vec::new(),
        }
    }

    pub fn is_full(&self) -> bool {
        self.key_count >= TEST_MAX_KEYS
    }

    pub fn serialize(&self) -> Vec<u8> {
        let mut bytes = Vec::new();

        let node_type_byte = match self.node_type {
            BtreeNodeType::Leaf => 0u8,
            BtreeNodeType::Internal => 1u8,
        };
        bytes.push(node_type_byte);

        let key_count = self.keys.len();
        bytes.extend(crate::storage::varint::encode_u64(key_count as u64));

        for key in &self.keys {
            bytes.extend(crate::storage::varint::encode_u64(*key));
        }

        bytes.extend(crate::storage::varint::encode_u64(
            self.pointers.len() as u64
        ));
        for ptr in &self.pointers {
            bytes.extend(crate::storage::varint::encode_u64(*ptr));
        }

        bytes
    }

    pub fn deserialize(bytes: &[u8]) -> Result<Self, String> {
        let mut offset = 0;

        let node_type_byte = bytes[offset];
        offset += 1;

        let node_type = match node_type_byte {
            0 => BtreeNodeType::Leaf,
            1 => BtreeNodeType::Internal,
            _ => return Err(format!("Invalid node type: {}", node_type_byte)),
        };

        let (key_count, consumed) =
            crate::storage::varint::decode_u64(&bytes[offset..]).map_err(|e| format!("{:?}", e))?;
        offset += consumed;

        let mut keys = Vec::with_capacity(key_count as usize);
        for _ in 0..key_count {
            let (key, consumed) = crate::storage::varint::decode_u64(&bytes[offset..])
                .map_err(|e| format!("{:?}", e))?;
            offset += consumed;
            keys.push(key);
        }

        let (pointer_count, consumed) =
            crate::storage::varint::decode_u64(&bytes[offset..]).map_err(|e| format!("{:?}", e))?;
        offset += consumed;

        let mut pointers = Vec::with_capacity(pointer_count as usize);
        for _ in 0..pointer_count {
            let (ptr, consumed) = crate::storage::varint::decode_u64(&bytes[offset..])
                .map_err(|e| format!("{:?}", e))?;
            offset += consumed;
            pointers.push(ptr);
        }

        Ok(BtreeNode {
            node_type,
            key_count: key_count as usize,
            keys,
            pointers,
        })
    }

    pub fn search(&self, key: u64) -> Result<usize, String> {
        for (i, k) in self.keys.iter().enumerate() {
            if *k == key {
                return Ok(i);
            }
            if *k > key {
                return Ok(i);
            }
        }
        Ok(self.keys.len())
    }

    pub fn split(&mut self) -> Result<(BtreeNode, u64, BtreeNode), String> {
        if !self.is_full() {
            return Err("Node is not full".to_string());
        }

        let mid = self.key_count / 2;
        let middle_key = self.keys[mid];

        let mut left = BtreeNode::new(self.node_type.clone());
        let mut right = BtreeNode::new(self.node_type.clone());

        left.keys = self.keys[..mid].to_vec();
        left.pointers = self.pointers[..mid + 1].to_vec();
        left.key_count = left.keys.len();

        right.keys = self.keys[mid + 1..].to_vec();
        right.pointers = self.pointers[mid + 1..].to_vec();
        right.key_count = right.keys.len();

        self.key_count = 0;
        self.keys.clear();
        self.pointers.clear();

        Ok((left, middle_key, right))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialize_deserialize_leaf_node() {
        let mut node = BtreeNode::new(BtreeNodeType::Leaf);
        node.keys = vec![1, 2, 3];
        node.pointers = vec![100, 101, 102, 103];
        node.key_count = 3;

        let serialized = node.serialize();

        let deserialized = BtreeNode::deserialize(&serialized).unwrap();

        assert_eq!(node, deserialized);
    }

    #[test]
    fn search_finds_key_in_node() {
        let mut node = BtreeNode::new(BtreeNodeType::Leaf);
        node.keys = vec![10, 20, 30];
        node.pointers = vec![100, 101, 102, 103];
        node.key_count = 3;

        let result = node.search(20);
        assert_eq!(result, Ok(1));
    }

    #[test]
    fn search_returns_insert_position() {
        let node = BtreeNode::new(BtreeNodeType::Leaf);
        let result = node.search(15);
        assert_eq!(result, Ok(0));
    }

    #[test]
    fn split_divides_keys_evenly() {
        const TEST_MAX_KEYS: usize = 10;
        let mut node = BtreeNode::new(BtreeNodeType::Leaf);

        for i in 1..=TEST_MAX_KEYS {
            node.keys.push(i as u64);
            node.pointers.push((i * 10) as u64);
        }
        node.pointers.push(((TEST_MAX_KEYS + 1) * 10) as u64);
        node.key_count = TEST_MAX_KEYS;

        let original_key_count = node.keys.len();

        let (left, middle_key, right) = node.split().unwrap();

        assert_eq!(left.key_count, original_key_count / 2);
        assert_eq!(right.key_count, original_key_count / 2 - 1);
        assert_eq!(middle_key, (original_key_count / 2 + 1) as u64);
        assert_eq!(
            left.keys.last(),
            Some((original_key_count / 2) as u64).as_ref()
        );
        assert_eq!(
            right.keys.first(),
            Some((original_key_count / 2 + 2) as u64).as_ref()
        );
    }
}
