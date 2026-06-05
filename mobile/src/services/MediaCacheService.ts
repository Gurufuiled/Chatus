/**
 * MediaCacheService - LRU cache for media files.
 * Tracks downloaded/cached media by local_path, evicts oldest when over 500MB.
 * Persists metadata in JSON; uses expo-file-system for file ops.
 */

import * as FileSystem from "expo-file-system/legacy";

const MAX_CACHE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB
const METADATA_FILENAME = "media-cache-metadata.json";

export interface CacheEntry {
  localPath: string;
  size: number;
  lastAccess: number;
}

type MetadataStore = Record<string, CacheEntry>;

class MediaCacheServiceClass {
  private map = new Map<string, CacheEntry>();
  private _totalSize = 0;
  private _initialized = false;
  private _initPromise: Promise<void> | null = null;
  private metadataPath = "";
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persist();
    }, 5000);
  }

  private getMetadataPath(): string {
    if (this.metadataPath) return this.metadataPath;
    const base =
      FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
    if (!base) {
      throw new Error(
        "[MediaCacheService] No cache/document directory available",
      );
    }
    this.metadataPath = `${base}${base.endsWith("/") ? "" : "/"}${METADATA_FILENAME}`;
    return this.metadataPath;
  }

  private async ensureInit(): Promise<void> {
    if (this._initialized) return;
    if (this._initPromise) return this._initPromise;
    this._initPromise = this.doInit();
    await this._initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      const path = this.getMetadataPath();
      const content = await FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.UTF8,
      }).catch(() => "");
      const parsed: MetadataStore = content
        ? (JSON.parse(content) as MetadataStore)
        : {};
      if (typeof parsed !== "object" || parsed === null) {
        this.map.clear();
      } else {
        const now = Date.now();
        for (const [mediaId, entry] of Object.entries(parsed)) {
          if (
            entry &&
            typeof entry.localPath === "string" &&
            typeof entry.size === "number"
          ) {
            const info = await FileSystem.getInfoAsync(entry.localPath).catch(
              () => null,
            );
            if (info?.exists && !info.isDirectory) {
              const size = info.size ?? entry.size;
              this.map.set(mediaId, {
                localPath: entry.localPath,
                size,
                lastAccess:
                  typeof entry.lastAccess === "number" ? entry.lastAccess : now,
              });
            }
          }
        }
      }
      this.recalcTotalSize();
      await this.evictIfOverLimit();
      this._initialized = true;
    } catch (e) {
      if (__DEV__) {
        console.warn("[MediaCacheService] init failed:", e);
      }
      this.map.clear();
      this._totalSize = 0;
      this._initialized = true;
    }
  }

  private recalcTotalSize(): void {
    this._totalSize = 0;
    for (const entry of this.map.values()) {
      this._totalSize += entry.size;
    }
  }

  private async evictIfOverLimit(): Promise<void> {
    if (this._totalSize <= MAX_CACHE_SIZE_BYTES) return;
    const entries = Array.from(this.map.entries())
      .map(([id, e]) => ({ id, ...e }))
      .sort((a, b) => a.lastAccess - b.lastAccess);

    const deletePromises: Promise<void>[] = [];
    for (const { id, localPath, size } of entries) {
      if (this._totalSize <= MAX_CACHE_SIZE_BYTES) break;

      this.map.delete(id);
      this._totalSize -= size;

      const p = FileSystem.deleteAsync(localPath, { idempotent: true }).catch(
        (e) => {
          if (__DEV__) {
            console.warn(
              "[MediaCacheService] evict delete failed:",
              localPath,
              e,
            );
          }
        },
      );
      deletePromises.push(p);
    }

    await Promise.allSettled(deletePromises);
    this.schedulePersist();
  }

  private async persist(): Promise<void> {
    try {
      const store: MetadataStore = {};
      for (const [id, entry] of this.map.entries()) {
        store[id] = entry;
      }
      await FileSystem.writeAsStringAsync(
        this.getMetadataPath(),
        JSON.stringify(store),
        {
          encoding: FileSystem.EncodingType.UTF8,
        },
      );
    } catch (e) {
      if (__DEV__) {
        console.warn("[MediaCacheService] persist failed:", e);
      }
    }
  }

  /** Add or replace a cached media entry. Evicts LRU if over limit. */
  async add(
    mediaId: string,
    localPath: string,
    fileSize: number,
  ): Promise<void> {
    if (
      typeof fileSize !== "number" ||
      fileSize <= 0 ||
      !Number.isFinite(fileSize)
    ) {
      if (__DEV__)
        console.warn("[MediaCacheService] add: invalid fileSize", fileSize);
      return;
    }
    await this.ensureInit();
    try {
      const info = await FileSystem.getInfoAsync(localPath).catch(() => null);
      if (!info?.exists || info.isDirectory) {
        if (__DEV__)
          console.warn(
            "[MediaCacheService] add: file does not exist",
            localPath,
          );
        return;
      }
      const size = fileSize;
      const existing = this.map.get(mediaId);
      if (existing) {
        this._totalSize -= existing.size;
      }
      const entry: CacheEntry = {
        localPath,
        size,
        lastAccess: Date.now(),
      };
      this.map.set(mediaId, entry);
      this._totalSize += fileSize;
      await this.evictIfOverLimit();
      this.schedulePersist();
    } catch (e) {
      if (__DEV__) {
        console.warn("[MediaCacheService] add failed:", e);
      }
    }
  }

  /** Update lastAccess for LRU order. */
  async touch(mediaId: string): Promise<void> {
    await this.ensureInit();
    const entry = this.map.get(mediaId);
    if (entry) {
      entry.lastAccess = Date.now();
      this.schedulePersist();
    }
  }

  /** Get local path for mediaId, or null if not cached. Updates LRU on access. */
  async getPath(mediaId: string): Promise<string | null> {
    await this.ensureInit();
    const entry = this.map.get(mediaId);
    if (!entry) return null;
    try {
      const info = await FileSystem.getInfoAsync(entry.localPath);
      if (info.exists && !info.isDirectory) {
        entry.lastAccess = Date.now();
        this.schedulePersist();
        return entry.localPath;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Remove from cache and delete file. */
  async remove(mediaId: string): Promise<void> {
    await this.ensureInit();
    const entry = this.map.get(mediaId);
    if (!entry) return;
    try {
      await FileSystem.deleteAsync(entry.localPath, { idempotent: true });
    } catch (e) {
      if (__DEV__) {
        console.warn(
          "[MediaCacheService] remove delete failed:",
          entry.localPath,
          e,
        );
      }
    }
    this.map.delete(mediaId);
    this._totalSize -= entry.size;
    this.schedulePersist();
  }

  /** Total size of all cached files in bytes. */
  getTotalSize(): number {
    return this._totalSize;
  }
}

export const MediaCacheService = new MediaCacheServiceClass();
