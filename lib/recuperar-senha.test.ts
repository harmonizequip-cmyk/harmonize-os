import { describe, expect, it } from "vitest";
import { ehLinkDeRecuperacao, erroDoLink } from "./recuperar-senha";

describe("recuperar senha", () => {
  it("reconhece o link de recuperação", () => {
    expect(ehLinkDeRecuperacao("#access_token=abc&refresh_token=x&type=recovery")).toBe(true);
    expect(ehLinkDeRecuperacao("#access_token=abc&type=signup")).toBe(false);
    expect(ehLinkDeRecuperacao("")).toBe(false);
  });
  it("traduz o erro de link vencido", () => {
    expect(erroDoLink("#error=access_denied&error_code=otp_expired")).toMatch(/venceu/);
    expect(erroDoLink("#error=access_denied")).toMatch(/Não foi possível/);
    expect(erroDoLink("#access_token=abc&type=recovery")).toBeNull();
  });
});
