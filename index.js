const {
  exportAuth,
  exportDatabases,
  exportFunctions,
  exportStorage,
  exportProject,
} = require("./lib");
const { Command } = require("commander");
const prompts = require("prompts");
const axios = require("axios");
const fs = require("fs");
var zipFolder = require("zip-folder");
const { config } = require("process");

const program = new Command();

program
  .name("appwrite-migrate")
  .description("CLI tool to export and import Appwrite project.")
  .version("0.1.0")
  .parse();

const exportDate = new Date().toISOString();
const backupFolder = `export-${exportDate}`;

(async () => {
  let response;

  console.log("๐ง THIS SCRIPT DOES NOT BACKUP:");
  console.log(" - Function Deplyoments (will be deleted)");
  console.log(" - User Sessions (will be deleted)");
  console.log(" - Webhook Signatures (will be re-generated)");
  console.log(" - All Usage Stats (will be deleted)");

  let actions = [
    {
      type: "select",
      name: "action",
      message: "What are we doing today? ๐",
      choices: [
        { title: "Let's export a project! ๐", value: "export" },
        { title: "Let's import a project! ๐", value: "import" },
      ],
      initial: 0,
    },
    {
      type: "text",
      name: "endpoint",
      message: `May I ask your Appwrite endpoint? ๐`,
      validate: async (endpoint) => {
        const url = `${endpoint}/health/version`;
        try {
          await axios.default.get(url);
          return true;
        } catch (err) {
          return `๐ฃ We could not ping your server at: "${url}". We expected something like "https://yourserver.com/v1/health/version"`;
        }
      },
    },
    {
      type: "text",
      name: "email",
      message: `What's your login email? ๐ซ`,
    },
    {
      type: "password",
      name: "password",
      message: `Ssssh, and what's your password? ๐คซ`,
    },

    {
      type: "text",
      name: "projectId",
      message: `Lastly, what is project ID? ๐งพ`,
    },
  ];

  actions = actions.map((action, index) => {
    return {
      ...action,
      message: `[${index + 1}/${actions.length}] ` + action.message,
    };
  });

  if (!response) {
    response = await prompts(actions);
  }

  if (response.action === "export") {
    // Create temp folder
    fs.mkdirSync(backupFolder);

    response.folder = backupFolder;

    try {
      const secrets = JSON.parse(fs.readFileSync(".secrets.json").toString());
      response.auth = secrets[response.endpoint];
    } catch (err) {}

    if (!response.auth) {
      // Auth to Appwrite server
      const authResponse = await axios.default.post(
        response.endpoint + "/account/sessions/email",
        {
          email: response.email,
          password: response.password,
        }
      );

      response.auth = authResponse.headers["set-cookie"][0];

      let secrets = {};
      try {
        secrets = JSON.parse(fs.readFileSync(".secrets.json").toString());
      } catch (err) {}

      secrets[response.endpoint] = response.auth;
      fs.writeFileSync(".secrets.json", JSON.stringify(secrets));
    }

    // Export data from Appwrite server
    console.log("โ Exporting users, memberships and teams");
    await exportAuth(response);
    console.log("โ Exporting databases, collections and documents");
    await exportDatabases(response);
    console.log("โ Exporting functions");
    await exportFunctions(response);
    console.log("โ Exporting buckets and files");
    await exportStorage(response);
    console.log(
      "โ Exporting project settings, domains, webhooks, platforms, api keys"
    );
    await exportProject(response);

    // Zip temp folder
    await new Promise((res, rej) => {
      zipFolder(backupFolder, `${backupFolder}.tar.gz`, function (err) {
        if (err) {
          rej(err);
        } else {
          res(true);
        }
      });
    });

    // Delete temp folder
    fs.rmSync(backupFolder, { recursive: true });

    console.log("โ Exported to " + backupFolder + ".tar.gz");
  }
})().catch((err) => {
  console.error("โ Error occured:");
  console.error(err);

  // Delete temp folder
  fs.rmSync(backupFolder, { recursive: true });

  process.exit();
});
