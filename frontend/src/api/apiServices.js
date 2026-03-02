export async function searchEmployees(params = {}, token) {
  const q = new URLSearchParams();
  if (params.userIds) q.set("userIds", params.userIds);
  if (params.fullName) q.set("fullName", params.fullName);
  q.set("companyCode", params.companyCode || "C10"); // 기본값

  return await fetchApi(`/api/employees?${q.toString()}`, "GET", null, token);
}

export const fetchAdminUsers = async (token) => {
  return await fetchApi("/api/spotfire/admin-users", "GET", null, token);
};

export const addAdminUser = async (payload, token) => {
  return await fetchApi("/api/spotfire/admin-users", "POST", payload, token);
};

export const toggleAdminUser = async (id, is_active, token) => {
  return await fetchApi(
    `/api/spotfire/admin-users/${id}`,
    "PATCH",
    { is_active },
    token
  );
};

export const deleteAdminUser = async (id, token) => {
  return await fetchApi(
    `/api/spotfire/admin-users/${id}`,
    "DELETE",
    null,
    token
  );
};