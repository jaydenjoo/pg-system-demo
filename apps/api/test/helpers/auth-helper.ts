import request from "supertest";

type HttpServer = Parameters<typeof request>[0];

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export async function loginAsAdmin(server: HttpServer): Promise<string> {
  const res = await request(server)
    .post("/api/v1/auth/login")
    .send({ loginId: "admin", password: "Admin1234!@" })
    .expect(200);

  const body = res.body as { data: LoginResponse };
  return body.data.accessToken;
}

export async function loginAsMerchant(server: HttpServer): Promise<string> {
  const res = await request(server)
    .post("/api/v1/auth/login")
    .send({ loginId: "merchant_test", password: "Admin1234!@" })
    .expect(200);

  const body = res.body as { data: LoginResponse };
  return body.data.accessToken;
}

export async function loginAsAgent(server: HttpServer): Promise<string> {
  const res = await request(server)
    .post("/api/v1/auth/login")
    .send({ loginId: "agent_test", password: "Admin1234!@" })
    .expect(200);

  const body = res.body as { data: LoginResponse };
  return body.data.accessToken;
}

export function authenticatedRequest(
  server: HttpServer,
  method: "get" | "post" | "put" | "patch" | "delete",
  url: string,
  token: string,
): request.Test {
  return request(server)[method](url).set("Authorization", `Bearer ${token}`);
}
