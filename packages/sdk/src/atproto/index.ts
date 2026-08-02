export { getProfile, createProfileResolver, type Profile } from "./profiles";

export {
  resolveDidFromHandle,
  parseIdentifier,
  createHandleResolver,
} from "./handles";

export {
  createProfileSpaceRecord,
  removeProfileSpaceRecord,
  uploadBlob,
  type StreamHandleConfig,
} from "./records";
