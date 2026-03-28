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
const teachersFilePath = path.join(dataDir, "teachers.json");

ensureDataFile(classesFilePath, []);
ensureDataFile(studentsFilePath, {});
ensureDataFile(classChatsFilePath, {});
ensureDataFile(teachersFilePath, []);

bot.use(
  session({
    defaultSession: () => ({
      pendingHomework: null,
      pendingTeacherAssignment: null,
      waitingForClassSelection: false,
      classSelectionMode: "select",
      waitingForFullNameSetup: false,
      waitingForNewClassName: false,
      waitingForRenameNewClassName: false,
      renameClassSource: null,
      waitingForClassChatId: false,
      classChatTarget: null,
      waitingForAssignmentClassSelection: false,
      assignmentClassTarget: null,
      waitingForTeacherId: false,
      waitingForTeacherRemoval: false,
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
const changeClassText = "Сменить класс";
const sendHomeworkText = "Отправить домашку";
const changeNameText = "Сменить имя и фамилию";
const sendAssignmentText = "Задать домашнее задание";
const addTeacherText = "Добавить учителя";
const removeTeacherText = "Удалить учителя";

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

function getTeachers() {
  const teachers = readJson(teachersFilePath, []);
  return Array.isArray(teachers) ? teachers.map((item) => String(item)) : [];
}

function saveTeachers(teachers) {
  writeJson(teachersFilePath, teachers.map((item) => String(item)));
}

function addTeacher(userId) {
  const teachers = getTeachers();
  const id = String(userId);

  if (teachers.includes(id)) {
    return false;
  }

  teachers.push(id);
  saveTeachers(teachers);
  return true;
}

function removeTeacher(userId) {
  const id = String(userId);
  const teachers = getTeachers();
  const nextTeachers = teachers.filter((item) => item !== id);

  if (nextTeachers.length === teachers.length) {
    return false;
  }

  saveTeachers(nextTeachers);
  return true;
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
    lastClassChangeAt: new Date().toISOString(),
    pendingClassChangeRequest: null,
  };

  saveStudents(students);
}

function saveStudentFullName(userId, fullName) {
  const students = getStudents();
  const key = String(userId);

  students[key] = {
    ...(students[key] || {}),
    fullName,
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
  delete students[key].lastClassChangeAt;
  delete students[key].pendingClassChangeRequest;
  saveStudents(students);
  return true;
}

function resetStudentFullName(userId) {
  const students = getStudents();
  const key = String(userId);

  if (!students[key]) {
    return false;
  }

  delete students[key].fullName;
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
  const currentUserId = String(ctx.from?.id || "");
  return (
    currentUserId === String(teacherChatId) ||
    getTeachers().includes(currentUserId)
  );
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
    [sendAssignmentText, addTeacherText],
    [removeTeacherText],
  ]).resize();
}

function getTeacherListKeyboard(action) {
  const teachers = getTeachers();

  if (!teachers.length) {
    return Markup.inlineKeyboard([]);
  }

  const buttons = teachers.map((teacherId) =>
    Markup.button.callback(teacherId, `${action}:${teacherId}`)
  );
  const rows = [];

  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  return Markup.inlineKeyboard(rows);
}

function getStudentKeyboard() {
  return Markup.keyboard([
    [sendHomeworkText],
    [changeClassText, changeNameText],
  ])
    .resize()
    .oneTime(false);
}

function getStudentClassKeyboard(action = "select_class") {
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

function getTeacherApprovalKeyboard(userId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Одобрить", `approve_class_change:${userId}`),
      Markup.button.callback("Отклонить", `reject_class_change:${userId}`),
    ],
  ]);
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

function canStudentChangeClassNow(studentRecord) {
  if (!studentRecord?.className || !studentRecord?.lastClassChangeAt) {
    return true;
  }

  const lastChangeTime = new Date(studentRecord.lastClassChangeAt).getTime();

  if (Number.isNaN(lastChangeTime)) {
    return true;
  }

  const cooldownMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - lastChangeTime >= cooldownMs;
}

function getRemainingDaysUntilClassChange(studentRecord) {
  if (!studentRecord?.lastClassChangeAt) {
    return 0;
  }

  const lastChangeTime = new Date(studentRecord.lastClassChangeAt).getTime();

  if (Number.isNaN(lastChangeTime)) {
    return 0;
  }

  const cooldownMs = 7 * 24 * 60 * 60 * 1000;
  const remainingMs = cooldownMs - (Date.now() - lastChangeTime);

  if (remainingMs <= 0) {
    return 0;
  }

  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

function savePendingClassChangeRequest(userId, requestedClass) {
  const students = getStudents();
  const key = String(userId);

  students[key] = {
    ...(students[key] || {}),
    pendingClassChangeRequest: {
      requestedClass,
      requestedAt: new Date().toISOString(),
    },
  };

  saveStudents(students);
}

function clearPendingClassChangeRequest(userId) {
  const students = getStudents();
  const key = String(userId);

  if (!students[key]) {
    return;
  }

  students[key] = {
    ...students[key],
    pendingClassChangeRequest: null,
  };

  saveStudents(students);
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

async function requestClassSelection(ctx, mode = "select") {
  const classes = getClasses();

  ctx.session.waitingForClassSelection = true;
  ctx.session.classSelectionMode = mode;

  if (!classes.length) {
    await ctx.reply(
      "Пока нет доступных классов. Напишите преподавателю, чтобы он добавил класс через команду /addclass.",
      getMainKeyboard()
    );
    return;
  }

  await ctx.reply(
    mode === "select"
      ? "Выберите ваш класс."
      : "Выберите новый класс. Я отправлю запрос преподавателю на досрочную смену.",
    getStudentClassKeyboard(
      mode === "select" ? "select_class" : "request_class_change"
    )
  );
}

async function requestFullName(ctx, homeworkFile) {
  if (homeworkFile) {
    ctx.session.pendingHomework = homeworkFile;
  }
  ctx.session.waitingForFullNameSetup = true;

  await ctx.reply(
    "Напишите имя и фамилию ученика одним сообщением. Я сохраню их, и потом не нужно будет вводить заново.",
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
    ctx.session.waitingForFullNameSetup = false;
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

  ctx.session.pendingHomework = null;
  ctx.session.waitingForFullNameSetup = false;

  await ctx.reply(
    "Готово. Домашнее задание отправлено преподавателю.",
    getStudentKeyboard()
  );
}

function extractTeacherAssignment(ctx) {
  if (ctx.message?.text) {
    return {
      type: "text",
      text: ctx.message.text.trim(),
    };
  }

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

async function requestAssignmentClassSelection(ctx) {
  const classes = getClasses();

  if (!classes.length) {
    await ctx.reply("Сначала добавьте хотя бы один класс.", getTeacherKeyboard());
    return;
  }

  ctx.session.waitingForAssignmentClassSelection = true;
  ctx.session.assignmentClassTarget = null;

  await ctx.reply(
    "Выберите класс, которому нужно отправить домашнее задание.",
    getTeacherClassActionKeyboard("assignment_class")
  );
}

async function sendAssignmentToClassChat(ctx, assignment) {
  const className = ctx.session.assignmentClassTarget;

  if (!className) {
    await ctx.reply("Класс для задания не выбран. Начните заново.", getTeacherKeyboard());
    return;
  }

  const destinationChatId = getClassChatId(className);

  if (!destinationChatId) {
    await ctx.reply(
      `Для класса ${className} еще не назначен чат. Сначала используйте кнопку "Назначить чат классу".`,
      getTeacherKeyboard()
    );
    ctx.session.pendingTeacherAssignment = null;
    ctx.session.assignmentClassTarget = null;
    return;
  }

  const prefix = `Новое домашнее задание для класса ${className}`;

  if (assignment.type === "text") {
    await ctx.telegram.sendMessage(destinationChatId, `${prefix}\n\n${assignment.text}`);
  } else if (assignment.type === "document") {
    await ctx.telegram.sendDocument(destinationChatId, assignment.fileId, {
      caption: assignment.caption
        ? `${prefix}\n\n${assignment.caption}`
        : prefix,
    });
  } else if (assignment.type === "video") {
    await ctx.telegram.sendVideo(destinationChatId, assignment.fileId, {
      caption: assignment.caption
        ? `${prefix}\n\n${assignment.caption}`
        : prefix,
    });
  } else if (assignment.type === "photo") {
    await ctx.telegram.sendPhoto(destinationChatId, assignment.fileId, {
      caption: assignment.caption
        ? `${prefix}\n\n${assignment.caption}`
        : prefix,
    });
  }

  ctx.session.pendingTeacherAssignment = null;
  ctx.session.assignmentClassTarget = null;

  await ctx.reply(
    `Домашнее задание отправлено в чат класса ${className}.`,
    getTeacherKeyboard()
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
  ctx.session.classSelectionMode = "select";

  await ctx.reply(
    `Класс сохранен: ${selectedClass}. Теперь можете отправлять домашнее задание.`,
    getStudentKeyboard()
  );
}

async function requestTeacherApprovalForClassChange(ctx, selectedClass) {
  const classes = getClasses();

  if (!classes.includes(selectedClass)) {
    await ctx.reply(
      "Такого класса нет в списке. Пожалуйста, выберите класс кнопкой."
    );
    return;
  }

  const studentRecord = getStudentRecord(ctx.from.id) || {};
  const currentClass = studentRecord.className || "не выбран";

  if (currentClass === selectedClass) {
    await ctx.reply("Этот класс у вас уже выбран.", getStudentKeyboard());
    return;
  }

  if (studentRecord.pendingClassChangeRequest?.requestedClass === selectedClass) {
    await ctx.reply(
      `Запрос на смену класса на ${selectedClass} уже отправлен преподавателю.`,
      getStudentKeyboard()
    );
    return;
  }

  savePendingClassChangeRequest(ctx.from.id, selectedClass);
  ctx.session.waitingForClassSelection = false;
  ctx.session.classSelectionMode = "select";

  const fullName = studentRecord.fullName || "ФИО не указаны";
  const username = ctx.from?.username ? `@${ctx.from.username}` : "без username";

  await ctx.telegram.sendMessage(
    teacherChatId,
    `Запрос на смену класса\n\nУченик: ${fullName}\nТекущий класс: ${currentClass}\nНовый класс: ${selectedClass}\n${username}\nID: ${ctx.from.id}`,
    getTeacherApprovalKeyboard(ctx.from.id)
  );

  await ctx.reply(
    `Запрос на смену класса на ${selectedClass} отправлен преподавателю.`,
    getStudentKeyboard()
  );
}

function parseCommandArgument(text, command) {
  return text.slice(command.length).trim();
}

bot.start(async (ctx) => {
  ctx.session.pendingHomework = null;
  ctx.session.pendingTeacherAssignment = null;
  ctx.session.waitingForFullNameSetup = false;
  ctx.session.waitingForClassSelection = false;
  ctx.session.classSelectionMode = "select";
  ctx.session.waitingForNewClassName = false;
  ctx.session.waitingForRenameNewClassName = false;
  ctx.session.renameClassSource = null;
  ctx.session.waitingForClassChatId = false;
  ctx.session.classChatTarget = null;
  ctx.session.waitingForAssignmentClassSelection = false;
  ctx.session.assignmentClassTarget = null;
  ctx.session.waitingForTeacherId = false;
  ctx.session.waitingForTeacherRemoval = false;

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
    `Здравствуйте. Ваш класс: ${studentRecord.className}.\nИмя и фамилия: ${studentRecord.fullName || "не указаны"}.\nОтправьте файл с домашним заданием.`,
    getStudentKeyboard()
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
  ctx.session.pendingTeacherAssignment = null;
  ctx.session.waitingForFullNameSetup = false;
  ctx.session.waitingForClassSelection = false;
  ctx.session.classSelectionMode = "select";
  ctx.session.waitingForNewClassName = false;
  ctx.session.waitingForRenameNewClassName = false;
  ctx.session.renameClassSource = null;
  ctx.session.waitingForClassChatId = false;
  ctx.session.classChatTarget = null;
  ctx.session.waitingForAssignmentClassSelection = false;
  ctx.session.assignmentClassTarget = null;
  ctx.session.waitingForTeacherId = false;
  ctx.session.waitingForTeacherRemoval = false;

  await ctx.reply(
    "Действие отменено. Можете начать заново.",
    isTeacher(ctx) ? getTeacherKeyboard() : getStudentKeyboard()
  );
});

bot.hears(changeClassText, async (ctx) => {
  if (isTeacher(ctx)) {
    return;
  }

  const studentRecord = getStudentRecord(ctx.from.id);

  ctx.session.pendingHomework = null;
  ctx.session.waitingForFullNameSetup = false;
  ctx.session.waitingForClassSelection = false;
  ctx.session.classSelectionMode = "select";

  if (!studentRecord?.className) {
    await requestClassSelection(ctx, "select");
    return;
  }

  if (canStudentChangeClassNow(studentRecord)) {
    await requestClassSelection(ctx, "select");
    return;
  }

  const remainingDays = getRemainingDaysUntilClassChange(studentRecord);

  await ctx.reply(
    `Сменить класс самостоятельно можно через ${remainingDays} дн. Если нужно раньше, выберите новый класс, и я отправлю запрос преподавателю.`,
    getStudentKeyboard()
  );
  await requestClassSelection(ctx, "request");
});

bot.hears(changeNameText, async (ctx) => {
  if (isTeacher(ctx)) {
    return;
  }

  ctx.session.pendingHomework = null;
  ctx.session.waitingForFullNameSetup = false;

  await requestFullName(ctx);
});

bot.hears(sendHomeworkText, async (ctx) => {
  if (isTeacher(ctx)) {
    return;
  }

  const studentRecord = getStudentRecord(ctx.from.id);

  if (!studentRecord?.className) {
    await requestClassSelection(ctx);
    return;
  }

  await ctx.reply(
    `Ваш текущий класс: ${studentRecord.className}.\nИмя и фамилия: ${studentRecord.fullName || "не указаны"}.\nТеперь отправьте файл с домашним заданием.`,
    getStudentKeyboard()
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

bot.hears(sendAssignmentText, async (ctx) => {
  if (!isTeacher(ctx)) {
    return;
  }

  ctx.session.pendingTeacherAssignment = null;
  await requestAssignmentClassSelection(ctx);
});

bot.hears(addTeacherText, async (ctx) => {
  if (!isTeacher(ctx)) {
    return;
  }

  ctx.session.waitingForTeacherId = true;

  await ctx.reply(
    "Отправьте Telegram ID нового учителя одним сообщением. Новый учитель сможет пользоваться меню преподавателя.",
    getCancelKeyboard()
  );
});

bot.hears(removeTeacherText, async (ctx) => {
  if (!isTeacher(ctx)) {
    return;
  }

  const teachers = getTeachers();

  if (!teachers.length) {
    await ctx.reply(
      "Список дополнительных учителей пуст.",
      getTeacherKeyboard()
    );
    return;
  }

  ctx.session.waitingForTeacherRemoval = true;

  await ctx.reply(
    "Выберите учителя, которого нужно удалить.",
    getTeacherListKeyboard("remove_teacher")
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
    if (!ctx.session.assignmentClassTarget) {
      await ctx.reply(
        "Сначала нажмите кнопку \"Задать домашнее задание\" и выберите класс.",
        getTeacherKeyboard()
      );
      return;
    }

    const assignment = extractTeacherAssignment(ctx);

    if (!assignment) {
      await ctx.reply("Не удалось обработать задание. Попробуйте еще раз.");
      return;
    }

    ctx.session.pendingTeacherAssignment = assignment;
    await sendAssignmentToClassChat(ctx, assignment);
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

  if (!studentRecord?.fullName) {
    await requestFullName(ctx, homeworkFile);
    return;
  }

  ctx.session.pendingHomework = homeworkFile;
  await forwardHomeworkToTeacher(ctx, studentRecord.fullName);
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();

  if (ctx.session.waitingForTeacherId && isTeacher(ctx)) {
    const teacherId = text.replace(/\s+/g, "");

    if (!/^\d+$/.test(teacherId)) {
      await ctx.reply(
        "Отправьте числовой Telegram ID нового учителя.",
        getCancelKeyboard()
      );
      return;
    }

    if (teacherId === String(teacherChatId)) {
      ctx.session.waitingForTeacherId = false;
      await ctx.reply("Этот ID уже является основным учителем.", getTeacherKeyboard());
      return;
    }

    const added = addTeacher(teacherId);
    ctx.session.waitingForTeacherId = false;

    if (!added) {
      await ctx.reply("Этот учитель уже добавлен.", getTeacherKeyboard());
      return;
    }

    await ctx.reply(`Учитель с ID ${teacherId} добавлен.`, getTeacherKeyboard());
    await ctx.telegram.sendMessage(
      teacherId,
      "Вам выдан доступ учителя в этом боте. Нажмите /start, чтобы открыть меню преподавателя."
    );
    return;
  }

  if (isTeacher(ctx) && ctx.session.assignmentClassTarget) {
    const assignment = extractTeacherAssignment(ctx);

    if (!assignment || !assignment.text) {
      await ctx.reply("Отправьте текст задания одним сообщением.", getCancelKeyboard());
      return;
    }

    ctx.session.pendingTeacherAssignment = assignment;
    await sendAssignmentToClassChat(ctx, assignment);
    return;
  }

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

  if (ctx.session.waitingForFullNameSetup) {
    const fullName = text.replace(/\s+/g, " ");

    if (fullName.length < 5 || !fullName.includes(" ")) {
      await ctx.reply(
        "Пожалуйста, отправьте имя и фамилию одним сообщением. Например: Иван Петров"
      );
      return;
    }

    saveStudentFullName(ctx.from.id, fullName);
    ctx.session.waitingForFullNameSetup = false;

    if (ctx.session.pendingHomework) {
      await forwardHomeworkToTeacher(ctx, fullName);
      return;
    }

    await ctx.reply(
      `Имя и фамилия сохранены: ${fullName}.`,
      getStudentKeyboard()
    );
    return;
  }

  if (
    text === sendHomeworkText ||
    text === changeClassText ||
    text === changeNameText ||
    text === sendAssignmentText
  ) {
    return;
  }

  if (!ctx.session.pendingHomework) {
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
      "Сначала отправьте файл с домашним заданием: документ, фото или видео.",
      getStudentKeyboard()
    );
    return;
  }
});

bot.action(/^select_class:(.+)$/, async (ctx) => {
  const selectedClass = ctx.match[1];

  await handleClassSelection(ctx, selectedClass);
  await ctx.answerCbQuery();
});

bot.action(/^request_class_change:(.+)$/, async (ctx) => {
  const selectedClass = ctx.match[1];

  await requestTeacherApprovalForClassChange(ctx, selectedClass);
  await ctx.answerCbQuery();
});

bot.action(/^assignment_class:(.+)$/, async (ctx) => {
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

  ctx.session.waitingForAssignmentClassSelection = false;
  ctx.session.assignmentClassTarget = className;

  await ctx.editMessageText(
    `Выбран класс ${className}. Теперь отправьте текст, документ, фото или видео с домашним заданием.`
  );
  await ctx.reply(
    `Жду задание для класса ${className}.`,
    getCancelKeyboard()
  );
  await ctx.answerCbQuery("Класс выбран");
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

bot.action(/^approve_class_change:(.+)$/, async (ctx) => {
  if (!isTeacher(ctx)) {
    await ctx.answerCbQuery("Недостаточно прав");
    return;
  }

  const userId = ctx.match[1];
  const studentRecord = getStudentRecord(userId);
  const requestedClass = studentRecord?.pendingClassChangeRequest?.requestedClass;

  if (!studentRecord || !requestedClass) {
    await ctx.answerCbQuery("Запрос не найден");
    return;
  }

  saveStudentClass(userId, requestedClass);

  await ctx.editMessageText(
    `Запрос одобрен.\n\nУченик ID: ${userId}\nНовый класс: ${requestedClass}`
  );
  await ctx.telegram.sendMessage(
    userId,
    `Преподаватель одобрил смену класса. Ваш новый класс: ${requestedClass}.`,
    getStudentKeyboard()
  );
  await ctx.answerCbQuery("Смена класса одобрена");
});

bot.action(/^reject_class_change:(.+)$/, async (ctx) => {
  if (!isTeacher(ctx)) {
    await ctx.answerCbQuery("Недостаточно прав");
    return;
  }

  const userId = ctx.match[1];
  const studentRecord = getStudentRecord(userId);
  const requestedClass = studentRecord?.pendingClassChangeRequest?.requestedClass;

  if (!studentRecord || !requestedClass) {
    await ctx.answerCbQuery("Запрос не найден");
    return;
  }

  clearPendingClassChangeRequest(userId);

  await ctx.editMessageText(
    `Запрос отклонен.\n\nУченик ID: ${userId}\nЗапрошенный класс: ${requestedClass}`
  );
  await ctx.telegram.sendMessage(
    userId,
    `Преподаватель отклонил смену класса на ${requestedClass}. Пока остается текущий класс: ${studentRecord.className || "не выбран"}.`,
    getStudentKeyboard()
  );
  await ctx.answerCbQuery("Запрос отклонен");
});

bot.action(/^remove_teacher:(.+)$/, async (ctx) => {
  if (!isTeacher(ctx)) {
    await ctx.answerCbQuery("Недостаточно прав");
    return;
  }

  const teacherIdToRemove = ctx.match[1];

  if (teacherIdToRemove === String(teacherChatId)) {
    await ctx.answerCbQuery("Главного учителя удалить нельзя");
    return;
  }

  const removed = removeTeacher(teacherIdToRemove);
  ctx.session.waitingForTeacherRemoval = false;

  if (!removed) {
    await ctx.answerCbQuery("Учитель не найден");
    return;
  }

  await ctx.editMessageText(`Учитель с ID ${teacherIdToRemove} удален.`);
  await ctx.reply("Список учителей обновлен.", getTeacherKeyboard());
  await ctx.telegram.sendMessage(
    teacherIdToRemove,
    "Ваш доступ учителя в этом боте был удален."
  );
  await ctx.answerCbQuery("Учитель удален");
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
