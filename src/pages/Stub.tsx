export function Stub({ title, text }: { title: string; text: string }) {
  return (
    <div className="page">
      <h1 className="page-title">{title}</h1>
      <p className="page-sub">{text}</p>
    </div>
  );
}
