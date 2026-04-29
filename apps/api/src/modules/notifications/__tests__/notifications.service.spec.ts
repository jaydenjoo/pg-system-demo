import { Test, TestingModule } from "@nestjs/testing";
import { NotificationsService } from "../notifications.service";
import { SlackChannel } from "../channels/slack.channel";
import { EmailChannel } from "../channels/email.channel";
import { NotificationPayload } from "../channels/notification-channel.interface";

const mockSlack = { send: jest.fn() };
const mockEmail = { send: jest.fn() };

const makePayload = (title = "Test Alert"): NotificationPayload => ({
  title,
  message: "Test message",
  severity: "HIGH",
  timestamp: new Date(),
});

describe("NotificationsService", () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: SlackChannel, useValue: mockSlack },
        { provide: EmailChannel, useValue: mockEmail },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  // ================================================================
  // 알림 발송
  // ================================================================
  describe("send", () => {
    it("Slack과 Email 두 채널 모두 호출한다", async () => {
      mockSlack.send.mockResolvedValueOnce(undefined);
      mockEmail.send.mockResolvedValueOnce(undefined);

      await service.send(makePayload());

      expect(mockSlack.send).toHaveBeenCalledTimes(1);
      expect(mockEmail.send).toHaveBeenCalledTimes(1);
    });

    it("채널에 올바른 payload를 전달한다", async () => {
      mockSlack.send.mockResolvedValueOnce(undefined);
      mockEmail.send.mockResolvedValueOnce(undefined);

      const payload = makePayload("DB Connection Lost");
      await service.send(payload);

      expect(mockSlack.send).toHaveBeenCalledWith(payload);
      expect(mockEmail.send).toHaveBeenCalledWith(payload);
    });

    it("Slack 채널 실패 시 에러가 전파되지 않는다", async () => {
      mockSlack.send.mockRejectedValueOnce(new Error("Slack down"));
      mockEmail.send.mockResolvedValueOnce(undefined);

      await expect(service.send(makePayload())).resolves.not.toThrow();
      expect(mockEmail.send).toHaveBeenCalledTimes(1);
    });

    it("Email 채널 실패 시 에러가 전파되지 않는다", async () => {
      mockSlack.send.mockResolvedValueOnce(undefined);
      mockEmail.send.mockRejectedValueOnce(new Error("SMTP error"));

      await expect(service.send(makePayload())).resolves.not.toThrow();
      expect(mockSlack.send).toHaveBeenCalledTimes(1);
    });

    it("두 채널 모두 실패해도 에러가 전파되지 않는다", async () => {
      mockSlack.send.mockRejectedValueOnce(new Error("Slack down"));
      mockEmail.send.mockRejectedValueOnce(new Error("SMTP error"));

      await expect(service.send(makePayload())).resolves.not.toThrow();
    });
  });

  // ================================================================
  // 중복 방지 (dedup)
  // ================================================================
  describe("중복 방지", () => {
    it("5분 이내 동일 title+severity 이벤트는 한 번만 발송한다", async () => {
      mockSlack.send.mockResolvedValue(undefined);
      mockEmail.send.mockResolvedValue(undefined);

      const payload = makePayload("Duplicate Alert");
      await service.send(payload);
      await service.send(payload); // 중복 — 차단 예상

      expect(mockSlack.send).toHaveBeenCalledTimes(1);
      expect(mockEmail.send).toHaveBeenCalledTimes(1);
    });

    it("severity가 다른 동일 title은 별개로 처리한다", async () => {
      mockSlack.send.mockResolvedValue(undefined);
      mockEmail.send.mockResolvedValue(undefined);

      await service.send({ ...makePayload("Alert"), severity: "HIGH" });
      await service.send({ ...makePayload("Alert"), severity: "CRITICAL" });

      expect(mockSlack.send).toHaveBeenCalledTimes(2);
    });

    it("title이 다른 동일 severity는 별개로 처리한다", async () => {
      mockSlack.send.mockResolvedValue(undefined);
      mockEmail.send.mockResolvedValue(undefined);

      await service.send(makePayload("Alert A"));
      await service.send(makePayload("Alert B"));

      expect(mockSlack.send).toHaveBeenCalledTimes(2);
    });
  });

  // ================================================================
  // 미설정 채널 graceful skip
  // ================================================================
  describe("미설정 채널 skip", () => {
    it("채널이 undefined 응답(skip)을 반환해도 서비스는 정상 동작한다", async () => {
      // SLACK_WEBHOOK_URL 미설정 시 SlackChannel.send()는 바로 return (undefined resolve)
      mockSlack.send.mockResolvedValueOnce(undefined);
      mockEmail.send.mockResolvedValueOnce(undefined);

      await expect(
        service.send(makePayload("Skip Test")),
      ).resolves.not.toThrow();
    });
  });
});
