/** `*` で囲んだ部分を強調として切り出す。文言の中で、色やアニメーションを付ける語を示すのに使う。 */
export interface Segment {
  text: string;
  em: boolean;
}

export function splitEmphasis(text: string): Segment[] {
  return text
    .split(/(\*[^*]+\*)/)
    .filter((part) => part !== '')
    .map((part) => (part.startsWith('*') ? { text: part.slice(1, -1), em: true } : { text: part, em: false }));
}
