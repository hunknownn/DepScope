interface Props {
  active: "main" | "erd";
}

/**
 * 메인 그래프 뷰와 ERD 뷰를 전환하는 상단 헤더 탭.
 * 페이지 상단에 고정 배치되며 hash 기반 라우팅(#/ ↔ #/erd)으로 동작한다.
 */
export default function TopNav({ active }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        background: "#0b1220",
        borderBottom: "1px solid #1e293b",
        gap: 24,
        zIndex: 100
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9" }}>DepScope</div>
      <div style={{ display: "flex", gap: 4 }}>
        <NavLink href="#/" active={active === "main"}>그래프</NavLink>
        <NavLink href="#/erd" active={active === "erd"}>ERD</NavLink>
      </div>
    </div>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        padding: "6px 14px",
        fontSize: 13,
        color: active ? "#fff" : "#94a3b8",
        background: active ? "#1e293b" : "transparent",
        border: `1px solid ${active ? "#334155" : "transparent"}`,
        borderRadius: 6,
        textDecoration: "none"
      }}
    >
      {children}
    </a>
  );
}
