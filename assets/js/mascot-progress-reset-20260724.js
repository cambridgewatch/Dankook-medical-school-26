(() => {
  const resetMarker = "dkuMascotPoseProgressReset20260724";
  try {
    if (localStorage.getItem(resetMarker) === "done") return;
    const keysToRemove = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || "";
      if (
        key.startsWith("dkuMascotPoseProgressV1:")
        || key.startsWith("dkuMascotPoseProgressV2:")
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(resetMarker, "done");
  } catch {}
})();
