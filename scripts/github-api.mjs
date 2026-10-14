// GitHub REST API の最小クライアント（Node.js 標準の fetch のみ使用）

const API_VERSION = '2022-11-28';
const PER_PAGE = 100;

export function createGitHubClient({ token, repository, apiUrl = 'https://api.github.com', fetchImpl = globalThis.fetch }) {
  if (!token) {
    throw new Error('GITHUB_TOKEN が設定されていません');
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) {
    throw new Error(`GITHUB_REPOSITORY が不正です: ${repository}`);
  }

  async function request(path, { allow404 = false } = {}) {
    const response = await fetchImpl(`${apiUrl}/repos/${repository}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': API_VERSION,
        'User-Agent': 'deploy-gate',
      },
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`GitHub API ${path} の呼び出しに失敗しました（HTTP ${response.status}）`);
    }
    return response.json();
  }

  async function paginate(path, pick) {
    const items = [];
    for (let page = 1; ; page++) {
      const list = pick(await request(`${path}?per_page=${PER_PAGE}&page=${page}`));
      items.push(...list);
      if (list.length < PER_PAGE) return items;
    }
  }

  return {
    getPull: (number) => request(`/pulls/${number}`),
    listReviews: (number) => paginate(`/pulls/${number}/reviews`, (body) => body),
    listCheckRuns: (sha) => paginate(`/commits/${sha}/check-runs`, (body) => body.check_runs),
    tagExists: async (tag) => (await request(`/git/ref/tags/${encodeURIComponent(tag)}`, { allow404: true })) !== null,
  };
}
