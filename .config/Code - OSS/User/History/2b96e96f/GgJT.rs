// ABOUTME: Manages per-table B-tree storage with root page tracking.
// ABOUTME: Provides insert, delete, and scan operations for rows.

use crate::schema::Column;
use crate::storage::btree::{BtreeNode, BtreeNodeType};
use crate::storage::page::{Page, PageAllocator};
use crate::storage::row::Row;
use std::fs::File;
use std::io::{Seek, SeekFrom, Write};

/**
Manages per-table B-tree storage with root page tracking.

Holds the page ID of the B-tree root node and a [`PageAllocator`]
for allocating data pages. When `root_page_id` is `None`, the table
has no data yet; the root is created on the first insert.

[`PageAllocator`]: crate::storage::page::PageAllocator
*/
pub struct TableStorage {
    root_page_id: Option<u64>,
    allocator: PageAllocator,
}

impl Default for TableStorage {
    fn default() -> Self {
        Self::new()
    }
}

impl TableStorage {
    /**
    Creates a new empty table storage with no root page.
    */
    pub fn new() -> Self {
        TableStorage {
            root_page_id: None,
            allocator: PageAllocator::new(),
        }
    }

    /**
    Loads table storage referencing an existing B-tree rooted at `root_page_id`.
    */
    pub fn load(_file: &mut File, root_page_id: u64) -> Self {
        TableStorage {
            root_page_id: Some(root_page_id),
            allocator: PageAllocator::new(),
        }
    }

    /**
    Returns the root page ID of the B-tree, if one exists.
    */
    pub fn get_root_page_id(&self) -> Option<u64> {
        self.root_page_id
    }

    /**
    Writes the root page ID to the database file at byte offset 8.
    */
    pub fn save_root_page_id(&self, file: &mut File) -> std::io::Result<()> {
        if let Some(root_id) = self.root_page_id {
            let bytes = root_id.to_le_bytes();
            file.seek(SeekFrom::Start(8))?;
            file.write_all(&bytes)?;
        }
        Ok(())
    }

    /**
    Inserts a row into the table, creating the B-tree if it does not yet exist.

    When no root page exists, allocates a data page for the row via [`allocate_data_page`],
    creates a new leaf B-tree node containing the row's key and pointer, writes the root
    page to disk, and updates the root page ID. Panics with `unimplemented!` if a root
    page already exists.

    */
    pub fn insert_row(
        &mut self,
        file: &mut File,
        row: &Row,
        columns: &[Column],
    ) -> std::io::Result<u64> {
        if self.root_page_id.is_none() {
            let data_page_id = self.allocate_data_page(file, row, columns)?;

            let mut root_page = self.allocator.allocate(file)?;
            let mut node = BtreeNode::new(BtreeNodeType::Leaf);
            node.keys.push(row.rowid);
            node.pointers.push(data_page_id);
            node.key_count = 1;

            let serialized = node.serialize();
            root_page.data[..serialized.len()].copy_from_slice(&serialized);
            root_page.write(file)?;

            self.root_page_id = Some(root_page.page_id);
            Ok(row.rowid)
        } else {
            unimplemented!()
        }
    }

    /**
    Allocates a new data page, serializes the row onto it, and writes it to disk.
    */
    fn allocate_data_page(
        &mut self,
        file: &mut File,
        row: &Row,
        columns: &[Column],
    ) -> std::io::Result<u64> {
        let mut page = self.allocator.allocate(file)?;
        let serialized = row.serialize(columns);
        page.data[..serialized.len()].copy_from_slice(&serialized);
        page.write(file)?;
        Ok(page.page_id)
    }

    /**
    Scans all rows from the table by traversing the B-tree leaf node.

    Reads the root page and deserializes the leaf B-tree node, then iterates
    over each pointer to read and deserialize the corresponding data pages.
    Returns an empty list if no root page exists.
    */
    pub fn scan_rows(&self, file: &mut File, columns: &[Column]) -> std::io::Result<Vec<Row>> {
        let mut rows = Vec::new();

        if let Some(root_id) = self.root_page_id {
            let root_page = Page::read(file, root_id)?;
            let node =
                BtreeNode::deserialize(&root_page.data[..]).map_err(std::io::Error::other)?;

            if let BtreeNodeType::Leaf = node.node_type {
                for (i, _key) in node.keys.iter().enumerate() {
                    let data_page_id = node.pointers[i];
                    let data_page = Page::read(file, data_page_id)?;
                    let row = Row::deserialize(&data_page.data[..], columns)
                        .map_err(std::io::Error::other)?;
                    rows.push(row);
                }
            }
        }

        Ok(rows)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::ColumnType;
    use crate::storage::row::RowValue;
    use tempfile::tempfile;

    #[test]
    fn insert_row_adds_to_tree() {
        let mut file = tempfile().unwrap();
        let mut storage = TableStorage::new();

        let columns = vec![
            Column {
                name: "id".to_string(),
                data_type: ColumnType::Integer,
            },
            Column {
                name: "name".to_string(),
                data_type: ColumnType::Text,
            },
        ];

        let row = Row::new(
            1,
            vec![RowValue::Integer(42), RowValue::Text("Alice".to_string())],
        );

        let result = storage.insert_row(&mut file, &row, &columns);
        assert!(result.is_ok());
        assert!(storage.get_root_page_id().is_some());
    }

    #[test]
    fn scan_rows_returns_all_rows() {
        let mut file = tempfile().unwrap();
        let mut storage = TableStorage::new();

        let columns = vec![
            Column {
                name: "id".to_string(),
                data_type: ColumnType::Integer,
            },
            Column {
                name: "name".to_string(),
                data_type: ColumnType::Text,
            },
        ];

        let row1 = Row::new(
            1,
            vec![RowValue::Integer(42), RowValue::Text("Alice".to_string())],
        );

        storage.insert_row(&mut file, &row1, &columns).unwrap();

        let rows = storage.scan_rows(&mut file, &columns).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].rowid, 1);
    }
}
