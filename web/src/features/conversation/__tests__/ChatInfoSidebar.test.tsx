import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInfoSidebar } from "@/features/conversation/ChatInfoSidebar";
import { makeChat, makeMedia, makeMessage } from "@/test/fixtures";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={props.to}>{children}</a>
  ),
}));

vi.mock("@/queries/auth.queries", () => ({
  useMeQuery: () => ({ data: { id: "me-1" } }),
}));

vi.mock("@/queries/users.queries", () => ({
  useUserDetailQuery: () => ({ data: null }),
}));

const messages = [
  makeMessage({
    id: "img-1",
    msg_type: "image",
    media: [
      makeMedia({
        remote_url: "/uploads/a.jpg",
        thumbnail_url: "/uploads/a-thumb.jpg",
      }),
    ],
  }),
  makeMessage({
    id: "vid-1",
    msg_type: "video",
    media: [makeMedia({ remote_url: "/uploads/v.mp4", media_type: "video" })],
  }),
  makeMessage({
    id: "file-1",
    msg_type: "file",
    media: [
      makeMedia({
        remote_url: "/uploads/doc.pdf",
        file_name: "doc.pdf",
        file_size: 2048,
      }),
    ],
  }),
  makeMessage({
    id: "link-1",
    content: "Смотри https://example.com/page",
    msg_type: "text",
  }),
  makeMessage({
    id: "voice-1",
    msg_type: "voice",
    media: [
      makeMedia({
        remote_url: "/uploads/v.webm",
        duration_ms: 65000,
        media_type: "voice",
      }),
    ],
  }),
];

vi.mock("@/queries/messages.queries", () => ({
  useMessagesQuery: () => ({ data: messages }),
}));

describe("ChatInfoSidebar", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
  });

  it("renders media tab by default with grid items", () => {
    const chat = makeChat({ peer_display_name: "Анна" });
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    expect(screen.getByText("Информация")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Медиа" })).toHaveClass(
      "chat-info-sidebar__tab-btn--active",
    );
    const grid = document.querySelector(".chat-info-sidebar__media-grid");
    expect(grid).toBeTruthy();
    expect(within(grid as HTMLElement).getAllByRole("button")).toHaveLength(2);
  });

  it("opens lightbox when image thumbnail is clicked", async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    const grid = document.querySelector(
      ".chat-info-sidebar__media-grid",
    ) as HTMLElement;
    await user.click(within(grid).getAllByRole("button")[0]);

    expect(
      screen.getByRole("dialog", { name: "Просмотр изображения" }),
    ).toBeInTheDocument();
  });

  it("switches to files tab and lists file rows", async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    await user.click(screen.getByRole("tab", { name: "Файлы" }));
    expect(screen.getByText("doc.pdf")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
  });

  it("switches to links tab and shows extracted urls", async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    await user.click(screen.getByRole("tab", { name: "Ссылки" }));
    expect(screen.getByText("https://example.com/page")).toBeInTheDocument();
  });

  it("switches to voice tab with Russian labels", async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    await user.click(screen.getByRole("tab", { name: "Голосовые" }));
    expect(screen.getByText("Голосовое сообщение")).toBeInTheDocument();
    expect(screen.getByText(/1:05/)).toBeInTheDocument();
  });

  it("closes on Escape when lightbox is not open", async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
