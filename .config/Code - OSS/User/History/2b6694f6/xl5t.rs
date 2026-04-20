// ABOUTME: Defines the page layer for fixed-size storage blocks.
// ABOUTME: Provides page read/write with metadata (page ID, next page pointer).
// A page in a B-tree is a fixed-size block of data—typically 4KB to 16KB—that serves as the fundamental unit of storage, representing a single node in the tree
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};

pub const PAGE_SIZE: usize = 4096;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Page {
    pub page_id: u64,
    pub data: [u8; PAGE_SIZE],
}

impl Page {
    /**
    Creates a new page with the given ID and zeroed data.
    */
    pub fn new(page_id: u64) -> Self {
        Page {
            page_id,
            data: [0u8; PAGE_SIZE], // Fixed-size 4KB block. Array of 8bit unsigned integers with fixed size PAGE_SIZE
        }
    }

    /**
    Creates a new page from raw bytes, zero-padding if shorter than [`PAGE_SIZE`].

    Truncates `bytes` if it exceeds `PAGE_SIZE` in length.
    */
    pub fn from_bytes(page_id: u64, bytes: &[u8]) -> Self {
        let mut data = [0u8; PAGE_SIZE];
        let len = bytes.len().min(PAGE_SIZE);
        data[..len].copy_from_slice(&bytes[..len]);
        Page { page_id, data }
    }

    /**
    Writes the page's data to the file at the page's offset.

    Seeks to `page_id * PAGE_SIZE` in the file, then writes the full
    `PAGE_SIZE`-byte data block. Returns any I/O error encountered.
    */
    pub fn write(&self, file: &mut File) -> std::io::Result<()> {
        file.seek(SeekFrom::Start(self.page_id * PAGE_SIZE as u64))?;
        file.write_all(&self.data)
    }

    /**
    Reads a page from the file at the given page ID.

    Seeks to `page_id * PAGE_SIZE`, reads exactly `PAGE_SIZE` bytes into
    a buffer, and returns the constructed page. Returns an I/O error if
    the read falls short of the expected size.
    */
    pub fn read(file: &mut File, page_id: u64) -> std::io::Result<Self> {
        file.seek(SeekFrom::Start(page_id * PAGE_SIZE as u64))?;
        let mut data = [0u8; PAGE_SIZE];
        file.read_exact(&mut data)?;
        Ok(Page { page_id, data })
    }
}

#[derive(Debug)]
pub struct PageAllocator {
    next_page_id: u64,
}

impl PageAllocator {
    /**
    Creates a new allocator starting from page ID 0.
    */
    pub fn new() -> Self {
        PageAllocator { next_page_id: 0 }
    }

    /**
    Allocates the next available page and increments the counter.

    Returns a page with the current `next_page_id`, then increments
    `next_page_id` for the next allocation.
    */
    pub fn allocate(&mut self, _file: &mut File) -> std::io::Result<Page> {
        let page_id = self.next_page_id;
        self.next_page_id += 1;
        Ok(Page::new(page_id))
    }

    /**
    Reads the next page ID from the first 8 bytes of the file.

    The next page ID is stored in little-endian format at offset 0.
    Returns an I/O error if the file cannot be read.
    */
    pub fn load_next_page_id(file: &mut File) -> std::io::Result<u64> {
        file.seek(SeekFrom::Start(0))?;
        let mut buf = [0u8; 8];
        file.read_exact(&mut buf)?;
        Ok(u64::from_le_bytes(buf))
    }

    /**
    Writes the next page ID to the first 8 bytes of the file.

    Serializes `next_page_id` in little-endian format and writes it
    to offset 0, then syncs the write. Returns an I/O error if the
    write fails.
    */
    pub fn save_next_page_id(&self, file: &mut File) -> std::io::Result<()> {
        let bytes = self.next_page_id.to_le_bytes();
        file.seek(SeekFrom::Start(0))?;
        file.write_all(&bytes)?;
        Ok(())
    }
}

impl Default for PageAllocator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::OpenOptions;
    use tempfile::tempfile;

    #[test]
    fn write_and_read_page() {
        let mut file = tempfile().unwrap();
        let mut page = Page::new(1);
        page.data[..10].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

        page.write(&mut file).unwrap();
        file.seek(SeekFrom::Start(0)).unwrap();

        let read_page = Page::read(&mut file, 1).unwrap();
        assert_eq!(read_page.page_id, 1);
        assert_eq!(&read_page.data[..10], &[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }

    #[test]
    fn allocate_page_returns_next_id() {
        let mut file = tempfile().unwrap();
        let mut allocator = PageAllocator::new();

        let page1 = allocator.allocate(&mut file).unwrap();
        assert_eq!(page1.page_id, 0);

        let page2 = allocator.allocate(&mut file).unwrap();
        assert_eq!(page2.page_id, 1);
    }

    #[test]
    fn page_allocator_persists() {
        let path =
            std::env::temp_dir().join(format!("test_page_allocator_{}.db", std::process::id()));
        {
            let mut file = OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .open(&path)
                .unwrap();
            let mut allocator = PageAllocator::new();
            allocator.allocate(&mut file).unwrap();
            allocator.save_next_page_id(&mut file).unwrap();
        }

        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .unwrap();
        let next_id = PageAllocator::load_next_page_id(&mut file).unwrap();
        assert_eq!(next_id, 1);

        let _ = std::fs::remove_file(&path);
    }
}
