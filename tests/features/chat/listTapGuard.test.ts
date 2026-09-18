import {
  chatListTapClaimed,
  claimChatListTap,
} from "@/features/chat/listTapGuard";

describe("listTapGuard", () => {
  afterEach(() => {
    jest.useRealTimers();
    chatListTapClaimed(); // sonraki testi kirletmesin
  });

  it("dokunuşu bir kontrol sahiplendiyse liste-tap'i tüketir", () => {
    claimChatListTap();
    expect(chatListTapClaimed()).toBe(true);
  });

  it("okuma TÜKETİR: aynı sahiplenme ikinci tap'i de yutmaz", () => {
    claimChatListTap();
    chatListTapClaimed();
    expect(chatListTapClaimed()).toBe(false);
  });

  it("sahiplenme yoksa liste-tap serbest (klavye kapanır)", () => {
    expect(chatListTapClaimed()).toBe(false);
  });

  it("bayat sahiplenme sayılmaz: parmak kontrolden kayıp tap hiç gelmezse bayrak asılı kalmaz", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-17T12:00:00Z"));
    claimChatListTap();
    jest.setSystemTime(new Date("2026-09-17T12:00:02Z"));
    expect(chatListTapClaimed()).toBe(false);
  });
});
