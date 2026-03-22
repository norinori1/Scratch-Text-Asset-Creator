interface Props {
  count: number;
}

export default function CharCountBadge({ count }: Props) {
  return (
    <span className="inline-block bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full">
      {count.toLocaleString()} 文字
    </span>
  );
}
