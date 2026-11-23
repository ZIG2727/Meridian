// Shared photography for Meridian's three learning routes.
const image = (id, width = 1200) => "https://images.unsplash.com/" + id + "?auto=format&fit=crop&w=" + width + "&q=82";
export const MODULE_VISUALS = Object.freeze({
  english: {
    src: image("photo-1769794371055-54436b54577e", 1600),
    alt: "Книги, записи и материалы для изучения языка",
    credit: "Yen Vu",
    url: "https://unsplash.com/photos/desk-with-open-book-laptop-and-study-materials-HNjWq8WPyoY",
    kicker: "Язык и общение",
    gallery: [
      { src: image("photo-1769794370964-78412732f1cd"), alt: "Учебные записи, страницы с заметками и маркеры на столе", label: "Заметки и работа с материалом", url: "https://unsplash.com/photos/a-desk-with-papers-pens-and-a-highlighter-3Hcz2zvPqBI" },
      { src: image("photo-1455390582262-044cdead277a"), alt: "Рабочее место с бумагой и письменными принадлежностями", label: "Практика письма и выражения мыслей", url: "https://unsplash.com/s/photos/writing-notebook-study" }
    ]
  },
  chess: {
    src: image("photo-1727572337691-966f05cbf6fe", 1600),
    alt: "Шахматная партия на деревянной доске",
    credit: "Heriberto Murrieta",
    url: "https://unsplash.com/photos/a-close-up-of-a-chess-board-with-pieces-on-it-eHClqseTUWc",
    kicker: "Стратегия и расчёт",
    gallery: [
      { src: image("photo-1764105720662-8022d9569ba0"), alt: "Шахматная доска и фигуры в выразительной композиции", label: "Позиция и планирование", url: "https://unsplash.com/photos/a-chess-board-with-pieces-set-up-for-a-game-9nUvpp2sos4" },
      { src: image("photo-1529699211952-734e80c4d42b"), alt: "Шахматные фигуры на доске во время партии", label: "Фигуры и взаимодействие", url: "https://unsplash.com/s/photos/chess-board" }
    ]
  },
  python: {
    src: image("photo-1778146476147-5f8d4bd03c79", 1600),
    alt: "Рабочее место разработчика с ноутбуком и редактором кода",
    credit: "Bayu Syaits",
    url: "https://unsplash.com/photos/laptop-and-phone-on-a-desk-with-coding-software-open-oYzjGQ7LCVE",
    kicker: "Логика и создание",
    gallery: [
      { src: image("photo-1515879218367-8466d910aaa4"), alt: "Экран ноутбука с программным кодом", label: "Чтение и написание кода", url: "https://unsplash.com/s/photos/programming-code" },
      { src: image("photo-1605379399843-5870eea9b74e"), alt: "Рабочее место для разработки программ", label: "Среда разработки", url: "https://unsplash.com/s/photos/coding-workspace" }
    ]
  }
});
