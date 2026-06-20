import Link from "./Link";

export default function SiteHeader({ section }) {
  return (
    <h1 className="site-hdr">
      <Link to="/">fin.mino.mobi</Link>
      {section && (
        <>
          <span className="sep">·</span>
          {section}
        </>
      )}
    </h1>
  );
}
