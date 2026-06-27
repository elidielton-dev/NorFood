import * as FileSystem from "expo-file-system/legacy";

export async function readImageBase64(localUri: string): Promise<string> {
  return FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}
