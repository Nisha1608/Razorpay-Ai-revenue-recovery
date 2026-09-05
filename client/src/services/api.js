const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error?.message || "The RecoverAI API request failed.");
  }

  return body;
}

export const recoverAiApi = {
  health: () => request("/api/health"),
  metrics: () => request("/api/dashboard/metrics"),
  recoveryCases: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value !== undefined));
    return request(`/api/recovery-cases${query.size ? `?${query}` : ""}`);
  },
  recoveryCase: (recoveryCaseId) => request(`/api/recovery-cases/${recoveryCaseId}`),
  audit: (recoveryCaseId) => request(`/api/recovery-cases/${recoveryCaseId}/audit`),
  analyze: (recoveryCaseId) => request(`/api/recovery/${recoveryCaseId}/analyze`, { method: "POST" }),
  approve: (actionId, approvedBy) => request(`/api/recovery/actions/${actionId}/approve`, {
    method: "POST",
    body: JSON.stringify({ approvedBy }),
  }),
  execute: (actionId) => request(`/api/recovery/actions/${actionId}/execute`, { method: "POST" }),
};
