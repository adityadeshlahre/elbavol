export interface R2ObjectInfo {
  Key?: string;
  Size?: number;
  LastModified?: Date;
  ETag?: string;
}

export interface R2ListResult {
  Contents?: R2ObjectInfo[];
  IsTruncated?: boolean;
  NextContinuationToken?: string;
}

export interface R2UploadParams {
  Bucket: string;
  Key: string;
  Body: Buffer | Uint8Array | string;
  ContentType?: string;
}

export interface R2DownloadParams {
  Bucket: string;
  Key: string;
}

export interface R2ListParams {
  Bucket: string;
  Prefix?: string;
  MaxKeys?: number;
  ContinuationToken?: string;
}

export interface R2OperationResult {
  success: boolean;
  error?: string;
  data?: any;
}
