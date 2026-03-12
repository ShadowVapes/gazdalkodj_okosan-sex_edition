window.GitHubRepoApi = (() => {
  const apiBase = "https://api.github.com";

  function authHeaders(token) {
    return {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  async function getFile({ owner, repo, path, branch = "main", token }) {
    const res = await fetch(`${apiBase}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, {
      headers: authHeaders(token)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.message || "Nem sikerült lekérni a GitHub fájlt.");
    }
    const decoded = atob((data.content || "").replace(/\n/g, ""));
    return {
      sha: data.sha,
      content: decodeURIComponent(escape(decoded))
    };
  }

  async function upsertFile({ owner, repo, path, branch = "main", token, message, content, sha }) {
    const encoded = btoa(unescape(encodeURIComponent(content)));

    const doPut = async (targetSha) => {
      const res = await fetch(`${apiBase}/repos/${owner}/${repo}/contents/${path}`, {
        method: "PUT",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message,
          content: encoded,
          branch,
          ...(targetSha ? { sha: targetSha } : {})
        })
      });
      const data = await res.json();
      return { res, data };
    };

    let currentSha = sha || null;
    let lastData = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { res, data } = await doPut(currentSha);
      lastData = data;
      if (res.ok) return data;

      const msg = String(data?.message || "");
      const conflict = msg.includes("does not match") || msg.includes("sha") || res.status === 409 || res.status === 422;
      if (!conflict) break;

      try {
        const fresh = await getFile({ owner, repo, path, branch, token });
        currentSha = fresh?.sha || null;
      } catch (error) {
        currentSha = null;
      }
    }

    throw new Error(lastData?.message || "Nem sikerült menteni a GitHub repóba.");
  }

  return { getFile, upsertFile };
})();
