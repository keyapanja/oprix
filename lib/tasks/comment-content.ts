// Isomorphic helper shared by the comment editor and the comment renderer.
// A comment body is Markdown; images are stored as ![](…). Both the composer
// (chips) and the posted comment (thumbnail row) want the text and the images
// separated, so they live here in one place.

const IMG_MD = /!\[([^\]]*)\]\((\/[^\s)]*|https?:\/\/[^\s)]+)\)/g;

export type CommentImage = { url: string; alt: string };

/** Split a Markdown comment body into its text (images stripped) and its images. */
export function splitCommentImages(md: string): { text: string; images: CommentImage[] } {
  const images: CommentImage[] = [];
  const text = (md ?? "")
    .replace(IMG_MD, (_m, alt: string, url: string) => {
      images.push({ url, alt: alt || "image" });
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, images };
}
