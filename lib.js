const axios = require("axios");
const { Query } = require("node-appwrite");
const csvWriter = require("csv-write-stream");
const fs = require("fs");

const downloadFile = async (config, url, file) => {
  const headers = {};

  headers["Accept-Encoding"] = "gzip,deflate,compress";
  headers["cookie"] = config.auth;
  headers["x-appwrite-project"] = config.projectId;
  headers["x-appwrite-mode"] = "admin";

  const response = await axios.default({
    method: "get",
    url,
    headers,
    responseType: "stream",
  });

  response.data.pipe(fs.createWriteStream(file));
};

const exportService = async (
  config,
  url,
  responseArrayKey,
  fileName,
  params = {},
  headers = {},
  subAction = () => {},
  isConsole = false,
  ignorePagination = false
) => {
  let cursor = null;

  headers["Accept-Encoding"] = "gzip,deflate,compress";
  headers["cookie"] = config.auth;
  headers["x-appwrite-project"] = isConsole ? "console" : config.projectId;

  if (!isConsole) {
    headers["x-appwrite-mode"] = "admin";
  }

  fileName = `${config.folder}/${fileName}.csv`;
  const writer = csvWriter();
  writer.pipe(fs.createWriteStream(fileName));

  do {
    const newParams = {
      ...params,
    };
    newParams.queries = newParams.queries ?? [];
    newParams.queries.push(Query.limit(1));

    if (cursor !== null) {
      newParams.queries.push(Query.cursorAfter(cursor));
    }

    const res = (
      await axios.default.get(config.endpoint + url, {
        params: newParams,
        headers,
      })
    ).data;

    for (const entity of res[responseArrayKey]) {
      writer.write({
        data: JSON.stringify(entity),
      });

      if (subAction) {
        await subAction(entity);
      }
    }

    cursor =
      res[responseArrayKey].length <= 0
        ? null
        : res[responseArrayKey][res[responseArrayKey].length - 1].$id;

    if (ignorePagination) {
      cursor = null;
      break;
    }
  } while (cursor !== null);

  writer.end();
};

module.exports = {
  exportAuth: async (config) => {
    await exportService(config, "/users", "users", "users");
    await exportService(
      config,
      "/teams",
      "teams",
      "teams",
      {},
      {},
      async (team) => {
        await exportService(
          config,
          `/teams/${team.$id}/memberships`,
          "memberships",
          `memberships;${team.$id}`
        );
      }
    );
  },

  exportDatabases: async (config) => {
    await exportService(
      config,
      "/databases",
      "databases",
      "databases",
      {},
      {},
      async (db) => {
        await exportService(
          config,
          `/databases/${db.$id}/collections`,
          "collections",
          `collections;${db.$id}`,
          {},
          {},
          async (collection) => {
            await exportService(
              config,
              `/databases/${db.$id}/collections/${collection.$id}/documents`,
              "documents",
              `documents;${db.$id};${collection.$id}`
            );
          }
        );
      }
    );
  },

  exportFunctions: async (config) => {
    await exportService(config, "/functions", "functions", "functions");
  },

  exportStorage: async (config) => {
    await exportService(
      config,
      "/storage/buckets",
      "buckets",
      "buckets",
      {},
      {},
      async (bucket) => {
        fs.mkdirSync(`${config.folder}/files;${bucket.$id}`);
        await exportService(
          config,
          `/storage/buckets/${bucket.$id}/files`,
          "files",
          `files;${bucket.$id}`,
          {},
          {},
          async (file) => {
            await downloadFile(
              config,
              config.endpoint +
                `/storage/buckets/${bucket.$id}/files/${file.$id}/download`,
              `${config.folder}/files;${bucket.$id}/${file.$id}.${file.name.split('.').pop()}`
            );
          }
        );
      }
    );
  },

  exportProject: async (config) => {
    await exportService(
      config,
      `/projects`,
      "projects",
      "projects",
      {
        queries: [Query.equal("$id", config.projectId)],
      },
      {},
      () => {},
      true, true
    );

    await exportService(
      config,
      `/projects/${config.projectId}/webhooks`,
      "webhooks",
      "webhooks",
      {},
      {},
      () => {},
      true, true
    );

    await exportService(
      config,
      `/projects/${config.projectId}/keys`,
      "keys",
      "keys",
      {},
      {},
      () => {},
      true,
      true
    );

    await exportService(
      config,
      `/projects/${config.projectId}/platforms`,
      "platforms",
      "platforms",
      {},
      {},
      () => {},
      true, true
    );

    await exportService(
      config,
      `/projects/${config.projectId}/domains`,
      "domains",
      "domains",
      {},
      {},
      () => {},
      true, true
    );
  },
};
