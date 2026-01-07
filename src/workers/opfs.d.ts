/**
 * Type declarations for OPFS Sync Access Handle API.
 * These APIs are available in Web Workers for synchronous file I/O.
 */

interface FileSystemSyncAccessHandle {
  read(buffer: ArrayBufferView, options?: { at?: number }): number
  write(buffer: ArrayBufferView, options?: { at?: number }): number
  truncate(newSize: number): void
  getSize(): number
  flush(): void
  close(): void
}

interface FileSystemFileHandle {
  createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>
}
