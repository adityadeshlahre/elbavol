import {
  CreateBucketCommand,
  type CreateBucketCommandInput,
  type CreateBucketCommandOutput,
  DeleteBucketCommand,
  type DeleteBucketCommandInput,
  type DeleteBucketCommandOutput,
  DeleteObjectCommand,
  type DeleteObjectCommandInput,
  type DeleteObjectCommandOutput,
  GetObjectCommand,
  type GetObjectCommandInput,
  type GetObjectCommandOutput,
  ListBucketsCommand,
  type ListBucketsCommandInput,
  type ListBucketsCommandOutput,
  ListObjectsV2Command,
  type ListObjectsV2CommandInput,
  type ListObjectsV2CommandOutput,
  PutObjectCommand,
  type PutObjectCommandInput,
  type PutObjectCommandOutput,
  S3Client,
} from "@aws-sdk/client-s3";

const s3Config = {
  region: "us-east-1",
  endpoint: process.env.MINIO_ENDPOINT,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
};

export const S3 = new S3Client(s3Config);

export async function createBucket(
  params: CreateBucketCommandInput,
): Promise<CreateBucketCommandOutput> {
  const command = new CreateBucketCommand(params);
  const response = await S3.send(command);
  return response;
}

export async function deleteBucket(
  params: DeleteBucketCommandInput,
): Promise<DeleteBucketCommandOutput> {
  const command = new DeleteBucketCommand(params);
  const response = await S3.send(command);
  return response;
}

export async function listBuckets(
  params: ListBucketsCommandInput = {},
): Promise<ListBucketsCommandOutput> {
  const command = new ListBucketsCommand(params);
  const response = await S3.send(command);
  return response;
}

export async function listObjects(
  params: ListObjectsV2CommandInput,
): Promise<ListObjectsV2CommandOutput> {
  const command = new ListObjectsV2Command(params);
  const response = await S3.send(command);
  return response;
}

export async function getObject(
  params: GetObjectCommandInput,
): Promise<GetObjectCommandOutput> {
  const command = new GetObjectCommand(params);
  const response = await S3.send(command);
  return response;
}

export async function putObject(
  params: PutObjectCommandInput,
): Promise<PutObjectCommandOutput> {
  const command = new PutObjectCommand(params);
  const response = await S3.send(command);
  return response;
}

export async function deleteObject(
  params: DeleteObjectCommandInput,
): Promise<DeleteObjectCommandOutput> {
  const command = new DeleteObjectCommand(params);
  const response = await S3.send(command);
  return response;
}
