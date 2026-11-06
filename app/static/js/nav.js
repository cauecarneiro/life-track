// Navegação por hash. "replace" troca a URL sem empilhar histórico (usado ao escolher um dia).

export function go(hash, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, "", hash);
    window.dispatchEvent(new Event("app:route"));
  } else {
    location.hash = hash;
  }
}

export function parseRoute() {
  const raw = location.hash.slice(1) || "/";
  const [path, qs = ""] = raw.split("?");
  return {
    path,
    segs: path.split("/").filter(Boolean),
    q: Object.fromEntries(new URLSearchParams(qs)),
  };
}

/** Para onde o "voltar" da página de um indicador leva: a última página de resumo, categoria ou treinos visitada. */
export const back = { href: "#/", label: "Resumo" };
