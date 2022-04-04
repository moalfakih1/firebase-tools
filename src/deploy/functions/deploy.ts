import { setGracefulCleanup } from "tmp";
import * as clc from "cli-color";
import * as fs from "fs";

import { checkHttpIam } from "./checkIam";
import { logSuccess, logWarning } from "../../utils";
import { Options } from "../../options";
import { FirebaseError } from "../../error";
import * as args from "./args";
import * as gcs from "../../gcp/storage";
import * as gcf from "../../gcp/cloudfunctions";
import * as gcfv2 from "../../gcp/cloudfunctionsv2";
import * as backend from "./backend";

setGracefulCleanup();

async function uploadSourceV1(
  context: args.Context,
  codebase: string,
  region: string
): Promise<void> {
  const uploadUrl = await gcf.generateUploadUrl(context.projectId, region);
  const source = context.sources?.[codebase];
  if (!source) {
    throw new FirebaseError(
      `Source for codebase ${codebase} unexpectedly empty. ` +
        "This should never happen. Please file a bug at https://github.com/firebase/firebase-tools"
    );
  }
  source.sourceUrl = uploadUrl;
  const uploadOpts = {
    file: source.functionsSourceV1!,
    stream: fs.createReadStream(source.functionsSourceV1!),
  };
  await gcs.upload(uploadOpts, uploadUrl, {
    "x-goog-content-length-range": "0,104857600",
  });
}

async function uploadSourceV2(
  context: args.Context,
  codebase: string,
  region: string
): Promise<void> {
  const res = await gcfv2.generateUploadUrl(context.projectId, region);
  const source = context.sources?.[codebase];
  if (!source) {
    throw new FirebaseError(
      `Source for codebase ${codebase} unexpectedly empty. ` +
        "This should never happen. Please file a bug at https://github.com/firebase/firebase-tools"
    );
  }
  const uploadOpts = {
    file: source.functionsSourceV2!,
    stream: fs.createReadStream(source.functionsSourceV2!),
  };
  await gcs.upload(uploadOpts, res.uploadUrl);
  source.storage = { ...source.storage, [region]: res.storageSource };
}

/**
 * The "deploy" stage for Cloud Functions -- uploads source code to a generated URL.
 * @param context The deploy context.
 * @param options The command-wide options object.
 * @param payload The deploy payload.
 */
export async function deploy(
  context: args.Context,
  options: Options,
  payload: args.Payload
): Promise<void> {
  if (!context.config) {
    return;
  }

  if (
    !context.sources?.[context.config.codebase].functionsSourceV1 &&
    !context.sources?.[context.config.codebase].functionsSourceV2
  ) {
    return;
  }

  await checkHttpIam(context, options, payload);

  try {
    const want = payload.functions!.wantBackend;
    const uploads: Promise<void>[] = [];

    const v1Endpoints = backend.allEndpoints(want).filter((e) => e.platform === "gcfv1");
    if (v1Endpoints.length > 0) {
      // Choose one of the function region for source upload.
      uploads.push(uploadSourceV1(context, context.config.codebase, v1Endpoints[0].region));
    }

    for (const region of Object.keys(want.endpoints)) {
      // GCFv2 cares about data residency and will possibly block deploys coming from other
      // regions. At minimum, the implementation would consider it user-owned source and
      // would break download URLs + console source viewing.
      if (backend.regionalEndpoints(want, region).some((e) => e.platform === "gcfv2")) {
        uploads.push(uploadSourceV2(context, context.config.codebase, region));
      }
    }
    await Promise.all(uploads);

    const source = context.config.source;
    if (uploads.length) {
      logSuccess(
        `${clc.green.bold("functions:")} ${clc.bold(source)} folder uploaded successfully`
      );
    }
  } catch (err: any) {
    logWarning(clc.yellow("functions:") + " Upload Error: " + err.message);
    throw err;
  }
}
