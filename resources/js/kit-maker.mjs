export const KIT_MAKER_MAX_SAMPLES = 10;
export const KIT_MAKER_FOLDER_NAME = "H";
export const KIT_MAKER_LIMIT_WARNING = "Kit Maker supports up to 10 samples. Please select 10 or fewer.";

function compareFilenamesAscending(left, right) {
  const a = left.name || "";
  const b = right.name || "";
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower < bLower) {
    return -1;
  }
  if (aLower > bLower) {
    return 1;
  }
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function buildKitMakerPlan(files) {
  const total = Array.isArray(files) ? files.length : 0;
  if (total === 0) {
    return {
      blocked: true,
      warning: "",
      folderName: KIT_MAKER_FOLDER_NAME,
      entries: [],
    };
  }

  if (total > KIT_MAKER_MAX_SAMPLES) {
    return {
      blocked: true,
      warning: KIT_MAKER_LIMIT_WARNING,
      folderName: KIT_MAKER_FOLDER_NAME,
      entries: [],
    };
  }

  const sorted = [...files].sort(compareFilenamesAscending);
  const entries = sorted.map((file, index) => ({
    file,
    outputName: `${index}.wav`,
    index,
  }));

  return {
    blocked: false,
    warning: "",
    folderName: KIT_MAKER_FOLDER_NAME,
    entries,
  };
}
