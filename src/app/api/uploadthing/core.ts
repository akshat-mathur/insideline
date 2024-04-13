import { db } from "@/db";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";

import {PDFLoader} from "langchain/document_loaders/fs/pdf";
import { pinecone } from "@/lib/pinecone";
import {OpenAIEmbeddings} from "langchain/embeddings/openai";
import {PineconeStore} from "langchain/vectorstores/pinecone";
import { getUserSubscriptionPlan } from "@/lib/stripe";
import { PLANS } from "@/config/stripe";

const f = createUploadthing({
  errorFormatter: (err) => {
    console.log("Error uploading file:(", err.message);
    console.log("  - Above error caused by:", err.cause);

    return { message: err.message };
  },
});

const middleware = async () => {
  const { getUser } = getKindeServerSession();
  const user = await getUser();

  if (!user || !user.id) throw new Error("Unauthorized");

  const subscriptionPlan = await getUserSubscriptionPlan();

  return { subscriptionPlan, userId: user.id };
};

const onUploadComplete = async ({
  metadata,
  file,
}: {
  metadata: Awaited<ReturnType<typeof middleware>>;
  file: {
    key: string;
    name: string;
    url: string;
  };
}) => {

  const isFileExist = await db.file.findFirst({
    where: {
      key: file.key,
    },
  });

  // If file already exists, stop running (prevents duplicates)
  if (isFileExist) return;

  const createdFile = await db.file.create({
    data : {
      key : file.key,
      name : file.name,
      userId : metadata.userId,
      // url: `https://uploadthing-prod.s3.us-west-2.amazonaws.com/${file.key}`,
      url : `https://utfs.io/f/${file.key}`,
      uploadStatus: "PROCESSING",
    },
  })

  try {
    const response = await fetch (file.url)

    const blob = await response.blob()

    const loader = new PDFLoader(blob)

    const pageLevelDocs = await loader.load()

    const pagesAmt = pageLevelDocs.length

    const { subscriptionPlan } = metadata;
    const { isSubscribed } = subscriptionPlan;

    const isProExceeded =
      pagesAmt > PLANS.find((plan) => plan.name === "Pro")!.pagesPerPdf;
    const isFreeExceeded =
      pagesAmt > PLANS.find((plan) => plan.name === "Free")!.pagesPerPdf;

    if ((isSubscribed && isFreeExceeded) || (!isSubscribed && isProExceeded)) {
      await db.file.update({
        data: {
          uploadStatus: "FAILED",
        },
        where: {
          id: createdFile.id,
        },
      });
    }

    const pineconeIndex = pinecone.Index("insideline")

    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    await PineconeStore.fromDocuments(pageLevelDocs, embeddings,{
      pineconeIndex,
      namespace: createdFile.id
    })

    await db.file.update({
      data: {
        uploadStatus: "SUCCESS"
      },
      where: {
        id: createdFile.id
      }
    })
  } catch (error) {
    console.dir(error, { depth: null });
console.log(`Error Type: ${typeof error}\n Error:${error}`);
    await db.file.update({
      data: {
        uploadStatus: "FAILED"
      },
      where: {
        id: createdFile.id
      }
    })
  }

}

 
export const ourFileRouter = {
  freePlanUploader: f({ pdf: { maxFileSize: "8MB" } })
    .middleware(middleware)
    .onUploadComplete(onUploadComplete),
  proPlanUploader: f({ pdf: { maxFileSize: "32MB" } })
    .middleware(middleware)
    .onUploadComplete(onUploadComplete),
} satisfies FileRouter;

 
export type OurFileRouter = typeof ourFileRouter;