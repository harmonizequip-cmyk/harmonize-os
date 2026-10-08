import { describe, it, expect } from "vitest";
import { chaveParaBytes, VAPID_PUBLIC_KEY } from "./push";

describe("chave de envio dos avisos", () => {
  it("vira os 65 bytes de uma chave P-256 não comprimida", () => {
    const bytes = chaveParaBytes(VAPID_PUBLIC_KEY);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
  });
});
