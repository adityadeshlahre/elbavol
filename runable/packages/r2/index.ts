import {
    S3Client,
    ListBucketsCommand,
    ListObjectsV2Command,
    GetObjectCommand,
    PutObjectCommand,
    DeleteBucketCommand,
    DeleteObjectCommand,
    CreateBucketCommand,
    type ListBucketsCommandInput,
    type ListBucketsCommandOutput,
    type ListObjectsV2CommandInput,
    type ListObjectsV2CommandOutput,
    type GetObjectCommandInput,
    type GetObjectCommandOutput,
    type PutObjectCommandInput,
    type PutObjectCommandOutput,
    type DeleteObjectCommandInput,
    type DeleteObjectCommandOutput,
    type DeleteBucketCommandInput,
    type DeleteBucketCommandOutput,
    type CreateBucketCommandInput,
    type CreateBucketCommandOutput,
} from "@aws-sdk/client-s3";

export const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID!,
        secretAccessKey: process.env.SECRET_ACCESS_KEY!,
    },
});

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
