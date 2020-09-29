const {} = require("lodash");
const XLSX = require("xlsx");
const community = require("./Community.json");
const kununka = require("./kununka.json");
const dotenv = require("dotenv");
const axios = require("axios");
const _ = require("lodash");

const result = dotenv.config();

if (result.error) {
  throw result.error;
}

const getDHIS2Url1 = (uri) => {
  if (uri !== "") {
    try {
      const url = new URL(uri);
      const dataURL = url.pathname.split("/");
      const apiIndex = dataURL.indexOf("api");

      if (apiIndex !== -1) {
        return url.href;
      } else {
        if (dataURL[dataURL.length - 1] === "") {
          return url.href + "api";
        } else {
          return url.href + "/api";
        }
      }
    } catch (e) {
      console.log(e);
      return e;
    }
  }
  return null;
};

const createDHIS2Auth = () => {
  const username = process.env.DHIS2_USER;
  const password = process.env.DHIS2_PASS;

  return { username, password };
};

const getDHIS2Url = () => {
  const uri = process.env.DHIS2_URL;
  return getDHIS2Url1(uri);
};

const queryDHIS2 = async (path, params) => {
  try {
    const baseUrl = getDHIS2Url();
    if (baseUrl) {
      const urlx = `${baseUrl}/${path}`;
      const { data } = await axios.get(urlx, {
        auth: createDHIS2Auth(),
        params,
      });

      return data;
    }
  } catch (e) {
    console.log("error", e.message);
  }
};

const downloadCategories = async () => {
  let wb = XLSX.utils.book_new();
  let { categories } = await queryDHIS2(`categories`, {
    fields: "id,name,code,categoryOptions[id,name,code]",
    paging: false,
  });

  const json = categories.map(({ id, name, code, categoryOptions }) => {
    return categoryOptions.map((categoryOption) => {
      return {
        categoryId: id,
        categoryName: name,
        categoryCode: code,
        ...categoryOption,
      };
    });
  });

  const dataSheet = XLSX.utils.json_to_sheet(_.flatten(json));
  XLSX.utils.book_append_sheet(wb, dataSheet, "categories");
  XLSX.writeFile(wb, `export.xlsx`);
};

const getDHIS2Events = async (program, params = {}) => {
  let wb = XLSX.utils.book_new();
  const { programStages, programTrackedEntityAttributes } = await queryDHIS2(
    `programs/${program}`,
    {
      fields:
        "programTrackedEntityAttributes[sortOrder,trackedEntityAttribute[id,name]],programStages[id,name,programStageDataElements[sortOrder,dataElement[id,name]]]",
    }
  );

  const { trackedEntityInstances } = await queryDHIS2(
    "trackedEntityInstances.json",
    {
      ...params,
      program,
      ouMode: "ALL",
      fields: "*",
    }
  );

  for (const stage of programStages) {
    const json = trackedEntityInstances.map(
      ({
        programOwners,
        enrollments,
        attributes,
        relationships,
        ...othersAttributes
      }) => {
        const calculatedAttributes = programTrackedEntityAttributes.map(
          (ptea) => {
            const currentAttribute = attributes.find(
              (attr) => ptea.trackedEntityAttribute.id === attr.attribute
            );

            if (currentAttribute) {
              return [ptea.trackedEntityAttribute.name, currentAttribute.value];
            }
            return [ptea.trackedEntityAttribute.name, ""];
          }
        );

        const currentEnrollment = enrollments.find(
          (e) => e.program === program
        );
        let allEvents = [];
        if (currentEnrollment) {
          const {
            notes,
            relationships,
            attributes,
            events,
            ...rest
          } = currentEnrollment;

          allEvents = events
            .filter((e) => e.programStage === stage.id)
            .map(({ notes, relationships, dataValues, ...others }) => {
              const calculatedElements = stage.programStageDataElements.map(
                (psde) => {
                  const currentElement = dataValues.find(
                    (dv) => dv.dataElement === psde.dataElement.id
                  );

                  if (currentElement) {
                    return [psde.dataElement.name, currentElement.value];
                  }

                  return [psde.dataElement.name, ""];
                }
              );

              return {
                ..._.fromPairs(calculatedAttributes),
                ...othersAttributes,
                ...others,
                ...rest,
                ..._.fromPairs(calculatedElements),
              };
            });
        }
        return _.flatten(allEvents);
      }
    );

    const attributeWorkSheet = XLSX.utils.json_to_sheet(_.flatten(json));
    XLSX.utils.book_append_sheet(
      wb,
      attributeWorkSheet,
      String(stage.name).slice(0, 30)
    );
    console.log(stage.name);
  }
  XLSX.writeFile(wb, `export.xlsx`);
};

// const downloadExecel = (data, name) => {
//   let wb = XLSX.utils.book_new();
//   const attributes = data.programTrackedEntityAttributes.map((pa) => {
//     return { ...pa.trackedEntityAttribute };
//   });

//   const attributeWorkSheet = XLSX.utils.json_to_sheet(attributes);

//   XLSX.utils.book_append_sheet(wb, attributeWorkSheet, "attributes");

//   for (const ps of data.programStages) {
//     const dataElements = ps.programStageDataElements.map((de) => {
//       return { ...de.dataElement };
//     });

//     const dataElementWorksheet = XLSX.utils.json_to_sheet(dataElements);
//     XLSX.utils.book_append_sheet(wb, dataElementWorksheet, ps.name);
//   }

//   XLSX.writeFile(wb, `${name}.xlsx`);
// };

// downloadExecel(drTB, "DRTB");

// downloadCategories().then(() => {
//   console.log("Finished");
// });

const downloadExecel1 = (data) => {
  let wb = XLSX.utils.book_new();

  const attributes = data.map(({ attributes, events, ...others }) => {
    const evs = Object.entries(events).map(([id, values]) => {
      return [id, values.value];
    });
    return { ...others, ...attributes, ..._.fromPairs(evs) };
  });

  const attributeWorkSheet = XLSX.utils.json_to_sheet(attributes);

  XLSX.utils.book_append_sheet(wb, attributeWorkSheet, "attributes");

  XLSX.writeFile(wb, `data.xlsx`);
};

// downloadExecel1(kununka);

getDHIS2Events("lHi9lIKtptC", {
  skipPaging: "true",
  programStartDate: "2020-09-01",
  programEndDate: "2020-09-30",
}).then(() => {
  console.log("Finished");
});
