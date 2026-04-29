import { registerAs } from "@nestjs/config";

export default registerAs("van", () => ({
  provider: (process.env["VAN_PROVIDER"] ?? "MOCK") as
    | "MOCK"
    | "NICE"
    | "KIS"
    | "KICC",
  nice: {
    apiUrl: process.env["NICE_VAN_API_URL"] ?? "",
    merchantCode: process.env["NICE_MERCHANT_CODE"] ?? "",
  },
  kis: {
    apiUrl: process.env["KIS_VAN_API_URL"] ?? "",
    merchantCode: process.env["KIS_MERCHANT_CODE"] ?? "",
  },
}));
