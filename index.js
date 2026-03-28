const fs = require("fs");
const path = require("path");
const { Telegraf, Markup, session } = require("telegraf");
const dotenv = require("dotenv");

dotenv.config();

const botToken = process.env.BOT_TOKEN;
const teacherChatId = process.env.TEACHER_CHAT_ID;

if (!botToken || !teacherChatId) {
  throw new Error(
    "Missing BOT_TOKEN or TEACHER_CHAT_ID in environment variables."
  );
}

const bot = new Telegraf(botToken);

const dataDir = path.join(__dirname, "data");
const classesFilePath = path.join(dataDir, "classes.json");
const studentsFilePath = path.join(dataDir, "students.json");
const classChatsFilePath = path.join(dataDir, "class-chats.json");

ensureDataFile(classesFilePath, []);
ensureDataFile(studentsFilePath, {});
ensureDataFile(classChatsFilePath, {});

bot.use(
  session({
    defaultSession: () => ({
      pendingHomework: null,
      waitingForFullName: false,
      waitingForClassSelection: false,
      waitingForNewClassName: false,
      waitingForRenameNewClassName: false,
      renameClassSource: null,
      waitingForClassChatId: false,
      classChatTarget: null,
    }),
  })
);

const cancelText = "Отменить";
const teacherMenuText = "Меню преподавателя";
const addClassText = "Добавить класс";
const showClassesText = "Показать классы";
const deleteClassText = "Удалить класс";
const renameClassText = "Переименовать класс";
const bindChatText = "Назначить чат классу";
const showRoutesText = "Показать чаты классов";

function ensureDataFile(filePath, defaultValue) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), "utf8");
  }
}

function readJson(filePath, fallbackValue) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error);
    return fallbackValue;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function getClasses() {
  const classes = readJson(classesFilePath, []);
  return Array.isArray(classes) ? classes : [];
}

function saveClasses(classes) {
  writeJson(classesFilePath, classes);
}

function getStudents() {
  const students = readJson(studentsFilePath, {});
  return students && typeof students === "object" ? students : {};
}

function saveStudents(students) {
  writeJson(studentsFilePath, students);
}

function getClassChats() {
  const routes = readJson(classChatsFilePath, {});
  return routes && typeof routes === "object" ? routes : {};
}

function saveClassChats(routes) {
  writeJson(classChatsFilePath, routes);
}

function getStudentRecord(userId) {
  const students = getStudents();
  return students[String(userId)] || null;
}

function saveStudentClass(userId, className) {
  const students = getStudents();
  const key = String(userId);

  students[key] = {
    ...(students[key] || {}),
    className,
  };

  saveStudents(students);
}

function resetStudentClass(userId) {
  const students = getStudents();
  const key = String(userId);

  if (!students[key]) {
    return false;
  }

  delete students[key].className;
  saveStudents(students);
  return true;
}

function removeClassFromStudents(className) {
  const students = getStudents();
  let hasChanges = false;

  for (const key of Object.keys(students)) {
    if (students[key]?.className === className) {
      delete students[key].className;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    saveStudents(students);
  }
}

function renameClassForStudents(oldClassName, newClassName) {
  const students = getStudents();
  let hasChanges = false;

  for (const key of Object.keys(students)) {
    if (students[key]?.className === oldClassName) {
      students[key].className = newClassName;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    saveStudents(students);
  }
}

function getClassChatId(className) {
  const routes = getClassChats();
  return routes[className] || null;
}

function setClassChatId(className, chatId) {
  const routes = getClassChats();
  routes[className] = String(chatId);
  saveClassChats(routes);
}

function removeClassChatId(className) {
  const routes = getClassChats();

  if (routes[className]) {
    delete routes[className];
    saveClassChats(routes);
  }
}

function renameClassChat(oldClassName, newClassName) {
  const routes = getClassChats();

  if (!routes[oldClassName]) {
    return;
  }

  routes[newClassName] = routes[oldClassName];
  delete routes[oldClassName];
  saveClassChats(routes);
}

function isTeacher(ctx) {
  return String(ctx.from?.id) === String(teacherChatId);
}

function getMainKeyboard() {
  return Markup.removeKeyboard();
}

function getCancelKeyboard() {
  return Markup.keyboard([[cancelText]]).resize().oneTime();
}

function getTeacherKeyboard() {
  return Markup.keyboard([
    [addClassText, showClassesText],
    [deleteClassText, renameClassText],
    [bindChatText, showRoutesText],
  ]).resize();
}

function getStudentClassKeyboard() {
  const classes = getClasses();

  if (!classes.length) {
    return Markup.inlineKeyboard([]);
  }

  const buttons = classes.map((className) =>
    Markup.button.callback(className, `select_class:${className}`)
  );
  const rows = [];

  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  return Markup.inlineKeyboard(rows);
}

function getTeacherClassActionKeyboard(action) {
  const classes = getClasses();

  if (!classes.length) {
    return Markup.inlineKeyboard([]);
  }

  const buttons = classes.map((className) =>
    Markup.button.callback(className, `${action}:${className}`)
  );
  const rows = [];

  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  return Markup.inlineKeyboard(rows);
}

function buildStudentLabel(ctx, fullName) {
  const username = ctx.from?.username ? `@${ctx.from.username}` : "без username";
  const telegramId = ctx.from?.id ? `ID: ${ctx.from.id}` : "ID неизвестен";
  const studentRecord = getStudentRecord(ctx.from?.id);
  const className = studentRecord?.className || "класс не выбран";

  return `${fullName}\nКласс: ${className}\n${username}\n${telegramId}`;
}

function getHomeworkDestination(className) {
  return getClassChatId(className) || String(teacherChatId);
}

function extractHomeworkFile(ctx) {
  if (ctx.message?.document) {
    return {
      type: "document",
      fileId: ctx.message.document.file_id,
      caption: ctx.message.caption || "",
    };
  }

  if (ctx.message?.video) {
    return {
      type: "video",
      fileId: ctx.message.video.file_id,
      caption: ctx.message.caption || "",
    };
  }

  if (ctx.message?.photo?.length) {
    const largestPhoto = ctx.message.photo[ctx.message.photo.length - 1];

    return {
      type: "photo",
      fileId: largestPhoto.file_id,
      caption: ctx.message.caption || "",
    };
  }

  return null;
}

async function requestClassSelection(ctx) {
  const classes = getClasses();

  ctx.session.waitingForClassSelection = true;

  if (!classes.length) {
    await ctx.reply(
      "Пока нет доступных классов. Напишите преподавателю, чтобы он добавил класс через команду /addclass.",
      getMainKeyboard()
    );
    return;
  }

  await ctx.reply(
    "Выберите ваш класс. Это нужно сделать только один раз.",
    getStudentClassKeyboard()
  );
}

async function requestFullName(ctx, homeworkFile) {
  ctx.session.pendingHomework = homeworkFile;
  ctx.session.waitingForFullName = true;

  await ctx.reply(
    "Файл получил. Теперь напишите имя и фамилию ученика одним сообщением.",
    getCancelKeyboard()
  );
}

async function forwardHomeworkToTeacher(ctx, fullName) {
  const homeworkFile = ctx.session.pendingHomework;

  if (!homeworkFile) {
    await ctx.reply(
      "Не вижу сохраненного файла. Пожалуйста, отправьте домашнее задание заново.",
      getMainKeyboard()
    );
    ctx.session.waitingForFullName = false;
    return;
  }

  const studentLabel = buildStudentLabel(ctx, fullName);
  const studentRecord = getStudentRecord(ctx.from?.id);
  const className = studentRecord?.className || "Без класса";
  const destinationChatId = getHomeworkDestination(className);
  const originalCaption = homeworkFile.caption
    ? `\n\nПодпись ученика:\n${homeworkFile.caption}`
    : "";
  const caption = `Новое домашнее задание\n\nУченик:\n${studentLabel}${originalCaption}`;

  if (homeworkFile.type === "document") {
    await ctx.telegram.sendDocument(destinationChatId, homeworkFile.fileId, {
      caption,
    });
  } else if (homeworkFile.type === "video") {
    await ctx.telegram.sendVideo(destinationChatId, homeworkFile.fileId, {
      caption,
    });
  } else if (homeworkFile.type === "photo") {
    await ctx.telegram.sendPhoto(destinationChatId, homeworkFile.fileId, {
      caption,
    });
  }

  await ctx.telegram.sendMessage(
    destinationChatId,
    `Домашнее задание получено от:\n${studentLabel}`
  );

  ctx.session.pendingHomework = null;
  ctx.session.waitingForFullName = false;

  await ctx.reply(
    "Готово. Домашнее задание отправлено преподавателю.",
    getMainKeyboard()
  );
}

async function handleClassSelection(ctx, selectedClass) {
  const classes = getClasses();

  if (!classes.includes(selectedClass)) {
    await ctx.reply(
      "Такого класса нет в списке. Пожалуйста, выберите класс кнопкой."
    );
    return;
  }

  saveStudentClass(ctx.from.id, selectedClass);
  ctx.session.waitingForClassSelection = false;

  await ctx.reply(
    `Класс сохранен: ${selectedClass}. Теперь можете отправлять домашнее задание.`,
    getMainKeyboard()
  );
}

function parseCommandArgument(text, command) {
  return text.slice(command.length).trim();
}

bot.start(async (ctx) => {
  ctx.session.pendingHomework = null;
  ctx.session.waitingForFullName = false;
  ctx.session.waitingForClassSelection = false;
  ctx.session.waitingForNewClassName = false;
  ctx.session.waitingForRenameNewClassName = false;
  ctx.session.renameClassSource = null;
  ctx.session.waitingForClassChatId = false;
  ctx.session.classChatTarget = null;

  if (isTeacher(ctx)) {
    await ctx.reply(
      "Бот запущен. Используйте кнопки ниже для управления классами.",
      getTeacherKeyboard()
    );
    return;
  }

  const studentRecord = getStudentRecord(ctx.from.id);

  if (!studentRecord?.className) {
    await requestClassSelection(ctx);
    return;
  }

  await ctx.reply(
    `Здравствуйте. Ваш класс: ${studentRecord.className}.\nОтправьте файл с домашним заданием, и после этого я попрошу имя и фамилию ученика.`,
    getMainKeyboard()
  );
});

bot.command("addclass", async (ctx) => {
  if (!isTeacher(ctx)) {
    await ctx.reply("Эта команда доступна только преподавателю.");
    return;
  }

  const className = parseCommandArgument(ctx.message.text, "/addclass")
    .replace(/\s+/g, " ")
    .trim();

  if (!className) {
    await ctx.reply("Использование: /addclass 7А");
    return;
  }

  const classes = getClasses();

  if (classes.includes(className)) {
    await ctx.reply(`Класс ${className} уже существует.`);
    return;
  }

  classes.push(className);
  classes.sort((a, b) => a.localeCompare(b, "ru"));
  saveClasses(classes);

  await ctx.reply(`Класс ${className} добавлен.`);
});

bot.command("classes", async (ctx) => {
  if (!isTeacher(ctx)) {
    await ctx.reply("Эта команда доступна только преподавателю.");
    return;
  }

  const classes = getClasses();

  if (!classes.length) {
    await ctx.reply("Список классов пока пуст.");
    return;
  }

  await ctx.reply(`Классы:\n${classes.map((item) => `- ${item}`).join("\n")}`);
});

bot.command("deleteclass", async (ctx) => {
  if (!isTeacher(ctx)) {
    await ctx.reply("Эта команда доступна только преподавателю.");
    return;
  }

  const className = parseCommandArgument(ctx.message.text, "/deleteclass")
    .replace(/\s+/g, " ")
    .trim();

  if (!className) {
    await ctx.reply("Использование: /deleteclass 7А");
    return;
  }

  const classes = getClasses();
  const nextClasses = classes.filter((item) => item !== className);

  if (nextClasses.length === classes.length) {
    await ctx.reply(`Класс ${className} не найден.`);
    return;
  }

  saveClasses(nextClasses);
  removeClassFromStudents(className);
  removeClassChatId(className);

  await ctx.reply(
    `Класс ${className} удален. У учеников с этим классом выбор класса сброшен.`
  );
});

bot.command("renameclass", async (ctx) => {
  if (!isTeacher(ctx)) {
    await ctx.reply("Эта команда доступна только преподавателю.");
    return;
  }

  const rawArgument = parseCommandArgument(ctx.message.text, "/renameclass");
  const parts = rawArgument.split("|").map((item) => item.replace(/\s+/g, " ").trim());

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    await ctx.reply("Использование: /renameclass 7А | 7Б");
    return;
  }

  const [oldClassName, newClassName] = parts;
  const classes = getClasses();

  if (!classes.includes(oldClassName)) {
    await ctx.reply(`Класс ${oldClassName} не найден.`);
    return;
  }

  if (classes.includes(newClassName)) {
    await ctx.reply(`Класс ${newClassName} уже существует.`);
    return;
  }

  const nextClasses = classes.map((item) =>
    item === oldClassName ? newClassName : item
  );

  nextClasses.sort((a, b) => a.localeCompare(b, "ru"));
  saveClasses(nextClasses);
  renameClassForStudents(oldClassName, newClassName);
  renameClassChat(oldClassName, newClassName);

  await ctx.reply(`Класс ${oldClassName} переименован в ${newClassName}.`);
});

bot.command("resetstudentclass", async (ctx) => {
  if (!isTeacher(ctx)) {
    await ctx.reply("Эта команда доступна только преподавателю.");
    return;
  }

  const studentId = parseCommandArgument(ctx.message.text, "/resetstudentclass");

  if (!studentId) {
    await ctx.reply("Использование: /resetstudentclass 123456789");
    return;
  }

  const wasReset = resetStudentClass(studentId);

  if (!wasReset) {
    await ctx.reply("У этого ученика не найден сохраненный класс.");
    return;
  }

  await ctx.reply(`Класс для ученика ${studentId} сброшен.`);
});

bot.command("chatid", async (ctx) => {
  const currentChatId = ctx.chat?.id;

  if (!currentChatId) {
    await ctx.reply("Не удалось определить ID этого чата.");
    return;
  }

  const chatTitle = ctx.chat?.title || ctx.chat?.username || "личный чат";

  await ctx.reply(`ID чата "${chatTitle}": ${currentChatId}`);
});

bot.hears(cancelText, async (ctx) => {
  ctx.session.pendingHomework = null;
  ctx.session.waitingForFullName = false;
  ctx.session.waitingForClassSelection = false;
  ctx.session.waitingForNewClassName = false;
  ctx.session.waitingForRenameNewClassName = false;
  ctx.session.renameClassSource = null;
  ctx.session.waitingForClassChatId = false;
  ctx.session.classChatTarget = null;

  await ctx.reply(
    "Действие отменено. Можете начать заново.",
    isTeacher(ctx) ? getTeacherKeyboard() : getMainKeyboard()
  );
});

bot.hears(teacherMenuText, async (ctx) => {
  if (!isTeacher(ctx)) {
    return;
  }

  ctx.session.waitingForNewClassName = false;
  ctx.session.waitingForRenameNewClassName = false;
  ctx.session.renameClassSource = null;
  ctx.session.waitingForClassChatId = false;
  ctx.session.classChatTarget = null;

  await ctx.reply("Меню преподавателя открыто.", getTeacherKeyboard());
});

bot.hears(addClassText, async (ctx) => {
  if (!isTeacher(ctx)) {
    return;
  }

  ctx.session.waitingForNewClassName = true;
  ctx.session.waitingForRenameNewClassName = false;
  ctx.session.renameClassSource = null;

  await ctx.reply(
    "Напишите название нового класса одним сообщением. Например: Gr05",
    getCancelKeyboard()
  );
});

bot.hears(showClassesText, async (ctx) => {
  if (!isTeacher(ctx)) {
    return;
  }

  const classes = getClasses();

  if (!classes.length) {
    await ctx.reply("Список классов пока пуст.", getTeacherKeyboard());
    return;
  }

  await ctx.reply(
    `Классы:\n${classes.map((item) => `- ${item}`).join("\n")}`,
    getTeacherKeyboard()
  );
});

bot.hears(deleteClassText, async (ctx) => {
  if (!isTeacher(ctx)) {
    return;
  }

  const classes = getClasses();

  if (!classes.length) {
    await ctx.reply("Удалять пока нечего. Список классов пуст.", getTeacherKeyboard());
    return;
  }

  await ctx.reply(
    "Выберите класс, который нужно удалить.",
    getTeacherClassActionKeyboard("delete_class")
  );
});

bot.hears(renameClassText, async (ctx) => {
  if (!isTeacher(ctx)) {
    return;
  }

  const classes = getClasses();

  if (!classes.length) {
    await ctx.reply("Переименовывать пока нечего. Список классов пуст.", getTeacherKeyboard());
    return;
  }

  ctx.session.waitingForRenameNewClassName = false;
  ctx.session.renameClassSource = null;

  await ctx.reply(
    "Выберите класс, который нужно переименовать.",
    getTeacherClassActionKeyboard("rename_class")
  );
});

bot.hears(bindChatText, async (ctx) => {
  if (!isTeacher(ctx)) {
    return;
  }

  const classes = getClasses();

  if (!classes.length) {
    await ctx.reply("Сначала добавьте хотя бы один класс.", getTeacherKeyboard());
    return;
  }

  ctx.session.waitingForClassChatId = false;
  ctx.session.classChatTarget = null;

  await ctx.reply(
    "Выберите класс, для которого нужно назначить отдельный чат.",
    getTeacherClassActionKeyboard("bind_chat")
  );
});

bot.hears(showRoutesText, async (ctx) => {
  if (!isTeacher(ctx)) {
    return;
  }

  const classes = getClasses();
  const routes = getClassChats();

  if (!classes.length) {
    await ctx.reply("Список классов пока пуст.", getTeacherKeyboard());
    return;
  }

  const lines = classes.map((className) => {
    const chatId = routes[className];
    return `- ${className}: ${chatId ? chatId : "основной чат преподавателя"}`;
  });

  await ctx.reply(`Маршруты классов:\n${lines.join("\n")}`, getTeacherKeyboard());
});

bot.on(["document", "video", "photo"], async (ctx) => {
  if (isTeacher(ctx)) {
    await ctx.reply("Преподавателю не нужно отправлять домашнее задание в этот бот.");
    return;
  }

  const studentRecord = getStudentRecord(ctx.from.id);

  if (!studentRecord?.className) {
    await requestClassSelection(ctx);
    return;
  }

  const homeworkFile = extractHomeworkFile(ctx);

  if (!homeworkFile) {
    await ctx.reply("Не удалось обработать файл. Попробуйте еще раз.");
    return;
  }

  await requestFullName(ctx, homeworkFile);
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();

  if (ctx.session.waitingForNewClassName && isTeacher(ctx)) {
    const className = text.replace(/\s+/g, " ").trim();
    const classes = getClasses();

    if (!className) {
      await ctx.reply("Название класса не должно быть пустым.");
      return;
    }

    if (classes.includes(className)) {
      await ctx.reply(`Класс ${className} уже существует.`, getTeacherKeyboard());
      ctx.session.waitingForNewClassName = false;
      return;
    }

    classes.push(className);
    classes.sort((a, b) => a.localeCompare(b, "ru"));
    saveClasses(classes);
    ctx.session.waitingForNewClassName = false;

    await ctx.reply(`Класс ${className} добавлен.`, getTeacherKeyboard());
    return;
  }

  if (ctx.session.waitingForClassChatId && isTeacher(ctx)) {
    const className = ctx.session.classChatTarget;
    const chatId = text.replace(/\s+/g, "");

    if (!className) {
      ctx.session.waitingForClassChatId = false;
      await ctx.reply("Класс для привязки не выбран. Начните заново.", getTeacherKeyboard());
      return;
    }

    if (!/^-?\d+$/.test(chatId)) {
      await ctx.reply(
        "Отправьте числовой chat ID. Для групп он обычно начинается с -100.",
        getCancelKeyboard()
      );
      return;
    }

    setClassChatId(className, chatId);
    ctx.session.waitingForClassChatId = false;
    ctx.session.classChatTarget = null;

    await ctx.reply(
      `Для класса ${className} назначен чат ${chatId}.`,
      getTeacherKeyboard()
    );
    return;
  }

  if (ctx.session.waitingForRenameNewClassName && isTeacher(ctx)) {
    const newClassName = text.replace(/\s+/g, " ").trim();
    const oldClassName = ctx.session.renameClassSource;
    const classes = getClasses();

    if (!oldClassName) {
      ctx.session.waitingForRenameNewClassName = false;
      await ctx.reply("Не выбран исходный класс. Начните заново.", getTeacherKeyboard());
      return;
    }

    if (!newClassName) {
      await ctx.reply("Новое название класса не должно быть пустым.");
      return;
    }

    if (classes.includes(newClassName)) {
      await ctx.reply(`Класс ${newClassName} уже существует.`, getTeacherKeyboard());
      ctx.session.waitingForRenameNewClassName = false;
      ctx.session.renameClassSource = null;
      return;
    }

    const nextClasses = classes.map((item) =>
      item === oldClassName ? newClassName : item
    );

    saveClasses(nextClasses.sort((a, b) => a.localeCompare(b, "ru")));
    renameClassForStudents(oldClassName, newClassName);
    ctx.session.waitingForRenameNewClassName = false;
    ctx.session.renameClassSource = null;

    await ctx.reply(
      `Класс ${oldClassName} переименован в ${newClassName}.`,
      getTeacherKeyboard()
    );
    return;
  }

  if (!ctx.session.waitingForFullName) {
    if (isTeacher(ctx)) {
      await ctx.reply("Используйте кнопки меню ниже.", getTeacherKeyboard());
      return;
    }

    const studentRecord = getStudentRecord(ctx.from.id);

    if (!studentRecord?.className) {
      await requestClassSelection(ctx);
      return;
    }

    await ctx.reply(
      "Сначала отправьте файл с домашним заданием: документ, фото или видео."
    );
    return;
  }

  const fullName = text.replace(/\s+/g, " ");

  if (fullName.length < 5 || !fullName.includes(" ")) {
    await ctx.reply(
      "Пожалуйста, отправьте имя и фамилию одним сообщением. Например: Иван Петров"
    );
    return;
  }

  await forwardHomeworkToTeacher(ctx, fullName);
});

bot.action(/^select_class:(.+)$/, async (ctx) => {
  const selectedClass = ctx.match[1];

  await handleClassSelection(ctx, selectedClass);
  await ctx.answerCbQuery();
});

bot.action(/^delete_class:(.+)$/, async (ctx) => {
  if (!isTeacher(ctx)) {
    await ctx.answerCbQuery("Недостаточно прав");
    return;
  }

  const className = ctx.match[1];
  const classes = getClasses();
  const nextClasses = classes.filter((item) => item !== className);

  if (nextClasses.length === classes.length) {
    await ctx.answerCbQuery("Класс не найден");
    return;
  }

  saveClasses(nextClasses);
  removeClassFromStudents(className);
  removeClassChatId(className);

  await ctx.editMessageText(
    `Класс ${className} удален. У учеников с этим классом выбор класса сброшен.`
  );
  await ctx.reply("Обновленное меню преподавателя.", getTeacherKeyboard());
  await ctx.answerCbQuery("Класс удален");
});

bot.action(/^rename_class:(.+)$/, async (ctx) => {
  if (!isTeacher(ctx)) {
    await ctx.answerCbQuery("Недостаточно прав");
    return;
  }

  const className = ctx.match[1];
  const classes = getClasses();

  if (!classes.includes(className)) {
    await ctx.answerCbQuery("Класс не найден");
    return;
  }

  ctx.session.renameClassSource = className;
  ctx.session.waitingForRenameNewClassName = true;

  await ctx.editMessageText(
    `Выбран класс ${className}. Теперь отправьте новое название одним сообщением.`
  );
  await ctx.reply("Жду новое название класса.", getCancelKeyboard());
  await ctx.answerCbQuery("Класс выбран");
});

bot.action(/^bind_chat:(.+)$/, async (ctx) => {
  if (!isTeacher(ctx)) {
    await ctx.answerCbQuery("Недостаточно прав");
    return;
  }

  const className = ctx.match[1];
  const classes = getClasses();

  if (!classes.includes(className)) {
    await ctx.answerCbQuery("Класс не найден");
    return;
  }

  ctx.session.classChatTarget = className;
  ctx.session.waitingForClassChatId = true;

  await ctx.editMessageText(
    `Выбран класс ${className}. Теперь отправьте chat ID чата, куда нужно пересылать домашние задания этого класса.`
  );
  await ctx.reply(
    "Отправьте числовой chat ID. Для группы или супергруппы он обычно выглядит как -1001234567890.",
    getCancelKeyboard()
  );
  await ctx.answerCbQuery("Класс выбран");
});

bot.catch(async (error, ctx) => {
  console.error("Bot error:", error);

  try {
    await ctx.reply(
      "Произошла ошибка при обработке сообщения. Попробуйте еще раз."
    );
  } catch (replyError) {
    console.error("Reply error:", replyError);
  }
});

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

console.log("Telegram bot is running...");
