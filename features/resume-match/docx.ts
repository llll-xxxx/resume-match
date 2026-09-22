export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

export function replaceTextInWordXml(xml: string, replacements: { before: string; after: string }[]) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  if (documentXml.querySelector("parsererror")) throw new Error("Word 文档结构无法解析");
  const paragraphs = Array.from(documentXml.getElementsByTagName("w:p"));

  for (const { before, after } of replacements) {
    const needle = before.trim();
    if (!needle || before === after) continue;
    const paragraph = paragraphs.find((item) => Array.from(item.getElementsByTagName("w:t")).map((node) => node.textContent || "").join("").includes(needle));
    if (!paragraph) continue;
    const textNodes = Array.from(paragraph.getElementsByTagName("w:t"));
    const paragraphText = textNodes.map((node) => node.textContent || "").join("");
    const start = paragraphText.indexOf(needle);
    const end = start + needle.length;
    let offset = 0;
    let inserted = false;

    for (const textNode of textNodes) {
      const value = textNode.textContent || "";
      const nodeStart = offset;
      const nodeEnd = offset + value.length;
      offset = nodeEnd;
      if (nodeEnd <= start || nodeStart >= end) continue;
      const left = start >= nodeStart && start < nodeEnd ? value.slice(0, start - nodeStart) : "";
      const right = end > nodeStart && end <= nodeEnd ? value.slice(end - nodeStart) : "";
      if (!inserted) {
        textNode.textContent = `${left}${after}${right}`;
        inserted = true;
      } else {
        textNode.textContent = right;
      }
    }
  }

  return new XMLSerializer().serializeToString(documentXml);
}
