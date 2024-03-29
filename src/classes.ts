// Copyright 2022 kamekyame. All rights reserved. MIT license.

import { EOL, format, js2xml, Js2XmlOptions, log, xml2js } from "../deps.ts";
import { DominoError } from "./util.ts";

type XmlJs = {
  declaration?: { attributes: Attributes };
  elements?: Element[];
};

type Attributes = Record<string, unknown>;
type ElementElement = {
  type: "element";
  name: string;
  attributes?: Attributes;
  elements: Element[];
};
type TextElement = {
  type: "text";
  text: string;
};
type Element = ElementElement | TextElement;

export class File {
  public readonly xmlVersion = "1.0";
  public readonly xmlEncoding = "Shift_JIS";

  public moduleData: ModuleData;

  constructor(...moduleDataParam: ConstructorParameters<typeof ModuleData>) {
    this.moduleData = new ModuleData(...moduleDataParam);
  }

  toXML(options?: Js2XmlOptions) {
    const obj: XmlJs = {
      declaration: {
        attributes: {
          version: this.xmlVersion,
          encoding: this.xmlEncoding,
        },
      },
      elements: [
        this.moduleData.toXMLElement(),
      ],
    };
    const op: Js2XmlOptions = {
      ...options,
      compact: false,
    };
    const str = js2xml(obj, op);
    const formatStr = format(str, EOL.CRLF);
    return formatStr;
  }

  static fromXML(xml: string) {
    const doc = xml2js(xml, {
      compact: false,
      nativeTypeAttributes: true,
      alwaysChildren: true,
    }) as XmlJs;

    if (!doc.declaration) throw new DominoError("Invalid XML");
    if (doc.declaration.attributes.encoding !== "Shift_JIS") {
      throw new DominoError("Invalid encoding");
    }
    if (
      !doc.elements || !doc.elements[0] || doc.elements[0].type !== "element"
    ) {
      throw new DominoError("Invalid XML: Not found ModuleData");
    }
    const {
      name,
      folder,
      priority,
      fileCreator,
      fileVersion,
      website,
      tags,
    } = ModuleData.fromXMLElement(doc.elements[0]);
    const file = new File({
      name,
      folder,
      priority,
      fileCreator,
      fileVersion,
      website,
    }, tags);
    return file;
  }
}

export class ModuleData implements Base {
  public name: string;
  public folder?: string;
  public priority?: number;
  public fileCreator?: string;
  public fileVersion?: string;
  public website?: string;

  public tags: {
    rhythmTrackDefault?: RhythmTrackDefault;
    exclusiveEventDefault?: ExclusiveEventDefault;
    programChangeEventPropertyDlg?: ProgramChangeEventPropertyDlg;
    controlChangeEventDefault?: ControlChangeEventDefault;
    instrumentList?: InstrumentList;
    drumSetList?: DrumSetList;
    controlChangeMacroList?: ControlChangeMacroList;
    templateList?: TemplateList;
    defaultData?: DefaultData;
  };

  constructor(
    {
      name,
      folder,
      priority,
      fileCreator,
      fileVersion,
      website,
    }: {
      name: string;
      folder?: string;
      priority?: number;
      fileCreator?: string;
      fileVersion?: string;
      website?: string;
    },
    tags: ModuleData["tags"],
  ) {
    this.name = name;
    this.folder = folder;
    this.priority = priority;
    this.fileCreator = fileCreator;
    this.fileVersion = fileVersion;
    this.website = website;

    this.tags = tags;
  }

  check() {
    function flatFn(
      tag: CCMFolder | CCM | CCMLink | CCMFolderLink | Table | string,
    ): Array<CCMFolder | CCM | CCMLink | CCMFolderLink | Table | string> {
      if (tag instanceof CCMFolder) return [tag, ...tag.tags.flatMap(flatFn)];
      else return [tag];
    }
    function sortFn(a: CCMFolder | CCM | Table, b: CCMFolder | CCM | Table) {
      return (a.param.id ?? Infinity) - (b.param.id ?? Infinity);
    }
    function checkDuplicate(list: CCMFolder[] | CCM[] | Table[]) {
      let prevId = -1;
      list.forEach((tag) => {
        if (tag.param.id === undefined) return;
        if (tag.param.id === prevId) {
          let type: string;
          if (tag instanceof CCMFolder) type = "Folder";
          else if (tag instanceof CCM) type = "CCM";
          else type = "Table";
          log.error(`Duplicate ${type} tag ID: ${tag.param.id}`);
        }
        prevId = tag.param.id;
      });
    }
    function outputUsedId(list: CCMFolder[] | CCM[] | Table[]) {
      if (list.length === 0) return;
      if (list[0]?.param.id === undefined) return;
      let str = "";

      for (let i = 0; i < list.length; i++) {
        const start = list[i]?.param.id;
        if (start === undefined) break;
        let end: number | undefined;
        for (i++; i < list.length; i++) {
          const prev = list[i - 1]?.param.id as number;
          const next = list[i]?.param.id;
          if (next === undefined || next - prev >= 2) {
            i--;
            break;
          }
          end = next;
        }
        if (end === undefined || start === end) str += `${start} `;
        else str += `${start}-${end} `;
      }
      let type: string;
      if (list[0] instanceof CCMFolder) type = "Folder";
      else if (list[0] instanceof CCM) type = "CCM";
      else type = "Table";
      log.info(`Used Ids (${type}): ${str}`);
    }

    const ccmFlatList = this.tags.controlChangeMacroList?.tags.flatMap(flatFn);
    const ccm: CCM[] = [];
    const ccmFolder: CCMFolder[] = [];
    const ccmLink: CCMLink[] = [];
    const ccmFolderLink: CCMFolderLink[] = [];
    const table: Table[] = [];
    ccmFlatList?.forEach((tag) => {
      if (tag instanceof CCM) ccm.push(tag);
      else if (tag instanceof CCMFolder) ccmFolder.push(tag);
      else if (tag instanceof CCMLink) ccmLink.push(tag);
      else if (tag instanceof CCMFolderLink) ccmFolderLink.push(tag);
      else if (tag instanceof Table) table.push(tag);
    });

    ccm.sort(sortFn);
    ccmFolder.sort(sortFn);
    table.sort(sortFn);

    checkDuplicate(ccm);
    checkDuplicate(ccmFolder);
    checkDuplicate(table);

    outputUsedId(ccm);
    outputUsedId(ccmFolder);
    outputUsedId(table);
  }

  toXMLElement() {
    const element: Element = {
      type: "element",
      name: "ModuleData",
      attributes: {
        "Name": this.name,
        "Folder": this.folder,
        "Priority": this.priority,
        "FileCreator": this.fileCreator,
        "FileVersion": this.fileVersion,
        "WebSite": this.website,
      },
      elements: [],
    };

    Object.values(this.tags).forEach((tag) => {
      element.elements.push(tag.toXMLElement());
    });

    this.check();
    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const {
      "Name": name,
      "Folder": folder,
      "Priority": priority,
      "FileCreator": fileCreator,
      "FileVersion": fileVersion,
      "WebSite": website,
    } = element.attributes || {};

    if (name === undefined) {
      throw new DominoError("Invalid XML: Not found ModuleData Name");
    }
    const param: ConstructorParameters<typeof this>[0] = { name: String(name) };

    if (folder !== undefined) param.folder = String(folder);
    if (priority !== undefined) {
      if (typeof priority !== "number") {
        throw new DominoError("Invalid XML: Not found ModuleData Priority");
      } else param.priority = priority;
    }
    if (fileCreator !== undefined) param.fileCreator = String(fileCreator);
    if (fileVersion !== undefined) param.fileVersion = String(fileVersion);
    if (website !== undefined) param.website = String(website);

    const tags: ModuleData["tags"] = {};
    element.elements
      .forEach((e) => {
        if (e.type !== "element") return;
        switch (e.name) {
          case "RhythmTrackDefault":
            tags.rhythmTrackDefault = RhythmTrackDefault.fromXMLElement(e);
            break;
          case "ExclusiveEventDefault":
            tags.exclusiveEventDefault = ExclusiveEventDefault.fromXMLElement(
              e,
            );
            break;
          case "ProgramChangeEventPropertyDlg":
            tags.programChangeEventPropertyDlg = ProgramChangeEventPropertyDlg
              .fromXMLElement(e);
            break;
          case "ControlChangeEventDefault":
            tags.controlChangeEventDefault = ControlChangeEventDefault
              .fromXMLElement(e);
            break;
          case "InstrumentList":
            tags.instrumentList = InstrumentList.fromXMLElement(e);
            break;
          case "DrumSetList":
            tags.drumSetList = DrumSetList.fromXMLElement(e);
            break;
          case "ControlChangeMacroList":
            tags.controlChangeMacroList = ControlChangeMacroList.fromXMLElement(
              e,
            );
            break;
          case "TemplateList":
            tags.templateList = TemplateList.fromXMLElement(e);
            break;
          case "DefaultData":
            tags.defaultData = DefaultData.fromXMLElement(e);
            break;
        }
      });

    const moduleData = new ModuleData(param, tags);
    return moduleData;
  }
}

export class RhythmTrackDefault implements Base {
  public param: { gate: number };

  constructor(param: typeof RhythmTrackDefault.prototype.param) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "RhythmTrackDefault",
      attributes: {
        "Gate": this.param.gate,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "Gate": gate } = element.attributes || {};
    if (gate === undefined || typeof gate !== "number") {
      throw new DominoError(
        "Invalid XML: Not found RhythmTrackDefault Gate",
      );
    }
    const t = new this({ gate });
    return t;
  }
}

export class ExclusiveEventDefault implements Base {
  public param: { data: string };

  constructor(param: typeof ExclusiveEventDefault.prototype.param) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "ExclusiveEventDefault",
      attributes: {
        "Data": this.param.data,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "Data": data } = element.attributes || {};
    if (data === undefined || typeof data !== "string") {
      throw new DominoError(
        "Invalid XML: Not found ExclusiveEventDefault Data",
      );
    }
    const t = new this({ data });
    return t;
  }
}

export class ProgramChangeEventPropertyDlg implements Base {
  public param: { autoPreviewDelay: number };

  constructor(param: typeof ProgramChangeEventPropertyDlg.prototype.param) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "ProgramChangeEventPropertyDlg",
      attributes: {
        "AutoPreviewDelay": this.param.autoPreviewDelay,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "AutoPreviewDelay": autoPreviewDelay } = element.attributes || {};
    if (
      autoPreviewDelay === undefined || typeof autoPreviewDelay !== "number"
    ) {
      throw new DominoError(
        "Invalid XML: Not found ProgramChangeEventPropertyDlg AutoPreviewDelay",
      );
    }
    const t = new this({ autoPreviewDelay });
    return t;
  }
}

export class ControlChangeEventDefault implements Base {
  public param: { id: number };

  constructor(param: typeof ControlChangeEventDefault.prototype.param) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "ControlChangeEventDefault",
      attributes: {
        "ID": this.param.id,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "ID": id } = element.attributes || {};
    if (
      id === undefined || typeof id !== "number"
    ) {
      throw new DominoError(
        "Invalid XML: Not found ControlChangeEventDefault ID",
      );
    }
    const t = new this({ id });
    return t;
  }
}

export class MapList<T extends InstrumentMap | DrumMap> {
  public maps: T[];

  constructor(maps?: T[]) {
    this.maps = maps || [];
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "List",
      elements: this.maps.map((map) => map.toXMLElement()),
    };
    return element;
  }
}

export class InstrumentList extends MapList<InstrumentMap> implements Base {
  static fromXMLElement(element: ElementElement) {
    const maps = element.elements.flatMap((e) => {
      if (e.type === "element" && e.name === "Map") {
        return [InstrumentMap.fromXMLElement(e)];
      } else return [];
    });
    const instrumentList = new this(maps);
    return instrumentList;
  }

  override toXMLElement() {
    const element = super.toXMLElement();
    element.name = "InstrumentList";
    return element;
  }
}

export class DrumSetList extends MapList<DrumMap> implements Base {
  static fromXMLElement(element: ElementElement) {
    const maps = element.elements.flatMap((e) => {
      if (e.type === "element" && e.name == "Map") {
        return [DrumMap.fromXMLElement(e)];
      } else return [];
    });
    const instrumentList = new this(maps);
    return instrumentList;
  }

  override toXMLElement() {
    const element = super.toXMLElement();
    element.name = "DrumSetList";
    return element;
  }
}

export class ControlChangeMacroList implements Base {
  public tags: (CCMFolder | CCMFolderLink | CCM | CCMLink | Table)[];

  constructor(tags?: typeof ControlChangeMacroList.prototype.tags) {
    this.tags = tags || [];
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "ControlChangeMacroList",
      elements: this.tags.map((tag) => tag.toXMLElement()),
    };
    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const tags: ControlChangeMacroList["tags"] = [];
    element.elements.forEach(
      (e) => {
        if (e.type !== "element") return;
        switch (e.name) {
          case "Folder":
            tags.push(CCMFolder.fromXMLElement(e));
            break;
          case "FolderLink":
            tags.push(CCMFolderLink.fromXMLElement(e));
            break;
          case "CCM":
            tags.push(CCM.fromXMLElement(e));
            break;
          case "CCMLink":
            tags.push(CCMLink.fromXMLElement(e));
            break;
          case "Table":
            tags.push(Table.fromXMLElement(e));
            break;
        }
      },
    );
    const controlChangeMacroList = new this(tags);
    return controlChangeMacroList;
  }
}

export class TemplateList implements Base {
  public tags: (TemplateFolder | Template)[];

  constructor(tags?: typeof TemplateList.prototype.tags) {
    this.tags = tags || [];
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "TemplateList",
      elements: this.tags.map((tag) => tag.toXMLElement()),
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const tags: TemplateList["tags"] = [];
    element.elements.forEach((e) => {
      if (e.type !== "element") return;
      switch (e.name) {
        case "Folder":
          tags.push(TemplateFolder.fromXMLElement(e));
          break;
        case "Template":
          tags.push(Template.fromXMLElement(e));
          break;
      }
    });
    const templateList = new this(tags);
    return templateList;
  }
}

export class DefaultData implements Base {
  public tags: (Mark | Track)[];

  constructor(tags?: typeof DefaultData.prototype.tags) {
    this.tags = tags || [];
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "DefaultData",
      elements: this.tags.map((tag) => tag.toXMLElement()),
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const tags: DefaultData["tags"] = [];
    element.elements.forEach((e) => {
      if (e.type !== "element") return;
      switch (e.name) {
        case "Mark":
          tags.push(Mark.fromXMLElement(e));
          break;
        case "Track":
          tags.push(Track.fromXMLElement(e));
          break;
      }
    });
    const defaultData = new this(tags);
    return defaultData;
  }
}

class Map<T extends Bank> {
  public readonly name: string;
  public pcs: PC<T>[];
  constructor(name: string, pcs?: PC<T>[]) {
    this.name = name;
    this.pcs = pcs || [];
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Map",
      attributes: { "Name": this.name },
      elements: this.pcs.map((p) => p.toXMLElement()),
    };
    return element;
  }

  protected static fromXMLElementBase(element: ElementElement) {
    const { "Name": name } = element.attributes || {};

    if (name === undefined) {
      throw new DominoError("Invalid XML: Not Found Map Name");
    }

    const pcElements: ElementElement[] = element.elements.filter(
      (e): e is ElementElement => {
        if (e.type === "element" && e.name === "PC") return true;
        else return false;
      },
    );
    return { name: String(name), pcElements };
  }
}

export class InstrumentMap extends Map<Bank> implements Base {
  static fromXMLElement(element: ElementElement) {
    const { name, pcElements } = this.fromXMLElementBase(element);
    const pcs = pcElements.map((e) => InstrumentPC.fromXMLElement(e));
    const map = new this(name, pcs);
    return map;
  }
}
export class DrumMap extends Map<DrumBank> implements Base {
  static fromXMLElement(element: ElementElement) {
    const { name, pcElements } = this.fromXMLElementBase(element);
    const pcs = pcElements.map((e) => DrumPC.fromXMLElement(e));
    const map = new this(name, pcs);
    return map;
  }
}

class PC<T extends Bank> {
  public readonly name: string;
  public readonly pc: number;
  public banks: T[];

  constructor(name: string, pc: number, banks: [T, ...T[]]) {
    this.name = name;
    this.pc = pc;
    this.banks = banks;
  }

  check() {
    if (this.pc < 1 || this.pc > 128) {
      throw new DominoError(
        `PC must be between 1 and 128. Received: ${this.pc},${this.name}`,
      );
    }
  }

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "PC",
      attributes: {
        "Name": this.name,
        "PC": this.pc,
      },
      elements: this.banks.map((bank) => bank.toXMLElement()),
    };

    return element;
  }

  protected static fromXMLElementBase(element: ElementElement) {
    const { "Name": name, "PC": pc } = element.attributes || {};

    if (name === undefined) {
      throw new DominoError("Invalid XML: Not Found PC Name");
    }
    if (typeof pc !== "number") {
      throw new DominoError("Invalid XML: Not found PC");
    }

    const bankElements = element.elements.filter((e): e is ElementElement => {
      if (e.type === "element" && e.name === "Bank") return true;
      else return false;
    });
    if (bankElements.length === 0) {
      throw new DominoError("Invalid XML: Not found Bank");
    }

    return { name: String(name), pc, bankElements };
  }
}

export class InstrumentPC extends PC<Bank> implements Base {
  static fromXMLElement(element: ElementElement) {
    const { name, pc, bankElements } = this.fromXMLElementBase(element);
    const banks = bankElements.map((bank) => Bank.fromXMLElement(bank)) as [
      Bank,
      ...Bank[],
    ];

    const pc_ = new this(name, pc, banks);
    return pc_;
  }
}
export class DrumPC extends PC<DrumBank> implements Base {
  static fromXMLElement(element: ElementElement) {
    const { name, pc, bankElements } = this.fromXMLElementBase(element);
    const banks = bankElements.map((bank) => DrumBank.fromXMLElement(bank)) as [
      DrumBank,
      ...DrumBank[],
    ];

    const pc_ = new this(name, pc, banks);
    return pc_;
  }
}

export class Bank implements Base {
  public name: string;
  protected lsb?: number;
  protected msb?: number;

  constructor(name: string, lsb?: number, msb?: number) {
    this.name = name;
    this.lsb = lsb;
    this.msb = msb;
  }

  check() {
    if (this.lsb !== undefined) {
      if (this.lsb < 0 || this.lsb > 255) {
        throw new DominoError(
          `LSB must be between 0 and 255. Received: ${this.lsb}`,
        );
      }
    }
    if (this.msb !== undefined) {
      if (this.msb < 0 || this.msb > 255) {
        throw new DominoError(
          `MSB must be between 0 and 255. Received: ${this.msb}`,
        );
      }
    }
  }

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Bank",
      attributes: {
        "Name": this.name,
        "LSB": this.lsb,
        "MSB": this.msb,
      },
      elements: [],
    };
    return element;
  }

  protected static fromXMLElementBase(element: ElementElement) {
    const { "Name": name, "LSB": lsb, "MSB": msb } = element.attributes || {};

    if (name === undefined) {
      throw new DominoError("Invalid XML: Not found Name");
    }

    if (lsb !== undefined && typeof lsb !== "number") {
      throw new DominoError("Invalid XML: Not found Bank LSB");
    }

    if (msb !== undefined && typeof msb !== "number") {
      throw new DominoError("Invalid XML: Not found Bank MSB");
    }

    return { name: String(name), lsb, msb };
  }

  static fromXMLElement(element: ElementElement) {
    const { name, lsb, msb } = this.fromXMLElementBase(element);
    const bank = new Bank(name, lsb, msb);
    return bank;
  }
}
export class DrumBank extends Bank {
  public tones: Tone[];

  constructor(
    tones?: Tone[],
    ...bankConstructorParameters: ConstructorParameters<typeof Bank>
  ) {
    super(...bankConstructorParameters);
    this.tones = tones || [];
  }

  toXMLElement() {
    this.check();
    const element = super.toXMLElement();
    element.elements.push(...this.tones.map((tone) => tone.toXMLElement()));
    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { name, lsb, msb } = this.fromXMLElementBase(element);

    const tone = element.elements.flatMap((tone) => {
      if (tone.type === "element" && tone.name === "Tone") {
        return [Tone.fromXMLElement(tone)];
      } else return [];
    });

    const bank = new this(tone, name, lsb, msb);
    return bank;
  }
}

export class Tone implements Base {
  public name: string;
  public key: number;

  constructor(name: string, key: number) {
    this.name = name;
    this.key = key;
  }

  check() {
    if (this.key < 0 || this.key > 127) {
      throw new DominoError(
        `Key must be between 0 and 127. Received: ${this.key}`,
      );
    }
  }

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Tone",
      attributes: {
        "Name": this.name,
        "Key": this.key,
      },
      elements: [],
    };
    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "Name": name, "Key": key } = element.attributes || {};

    if (name === undefined) {
      throw new DominoError("Invalid XML: Not found Tone Name");
    }
    if (typeof key !== "number") {
      throw new DominoError("Invalid XML: Not found Tone Key");
    }

    const tone = new this(String(name), key);
    return tone;
  }
}

export class CCMFolder implements Base {
  public param: {
    name: string;
    id?: number;
  };
  public tags: (CCMFolder | CCMFolderLink | CCM | CCMLink | Table | string)[];

  constructor(
    param: typeof CCMFolder.prototype.param,
    tags?: typeof CCMFolder.prototype.tags,
  ) {
    this.param = param;
    this.tags = tags || [];
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Folder",
      attributes: {
        "Name": this.param.name,
        "ID": this.param.id,
      },
      elements: this.tags.map((tag) => {
        if (typeof tag === "string") {
          return {
            type: "element",
            name: "Memo",
            elements: [{ type: "text", text: tag }],
          };
        } else return tag.toXMLElement();
      }),
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const {
      "Name": name,
      "ID": id,
    } = element.attributes || {};
    if (name === undefined) {
      throw new DominoError("Invalid XML: Not found Folder Name");
    }
    const param: ConstructorParameters<typeof CCMFolder>[0] = {
      name: String(name),
    };
    if (id !== undefined) {
      if (typeof id !== "number") {
        throw new DominoError("Invalid XML: Not found Folder ID");
      } else param.id = id;
    }

    const tags: ConstructorParameters<typeof this>[1] = [];
    element.elements
      .forEach(
        (e) => {
          if (e.type !== "element") return;
          switch (e.name) {
            case "Folder":
              tags.push(CCMFolder.fromXMLElement(e));
              break;
            case "FolderLink":
              tags.push(CCMFolderLink.fromXMLElement(e));
              break;
            case "CCM":
              tags.push(CCM.fromXMLElement(e));
              break;
            case "CCMLink":
              tags.push(CCMLink.fromXMLElement(e));
              break;
            case "Table":
              tags.push(Table.fromXMLElement(e));
              break;
            case "Memo": {
              const textElement = e.elements[0];
              if (textElement?.type === "text") tags.push(textElement.text);
              else tags.push("");
              break;
            }
          }
        },
      );

    const folder = new this(param, tags);
    return folder;
  }
}

export class CCMFolderLink implements Base {
  public param: {
    name: string;
    id: number;
    value?: number;
    gate?: number;
  };

  constructor(
    param: typeof CCMFolderLink.prototype.param,
  ) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "FolderLink",
      attributes: {
        "Name": this.param.name,
        "ID": this.param.id,
        "Value": this.param.value,
        "Gate": this.param.gate,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "Name": name, "ID": id, "Value": value, "Gate": gate } =
      element.attributes || {};

    if (name === undefined) {
      throw new DominoError("Invalid XML: Not found FolderLink Name");
    }
    if (id === undefined || typeof id !== "number") {
      throw new DominoError("Invalid XML: Not found FolderLink ID");
    }
    const param: ConstructorParameters<typeof CCMFolderLink>[0] = {
      name: String(name),
      id,
    };
    if (value !== undefined) {
      if (typeof value !== "number") {
        throw new DominoError("Invalid XML: Not found FolderLink Value");
      } else param.value = value;
    }
    if (gate !== undefined) {
      if (typeof gate !== "number") {
        throw new DominoError("Invalid XML: Not found FolderLink Gate");
      } else param.gate = gate;
    }

    const folderLink = new this(param);
    return folderLink;
  }
}

export class CCM implements Base {
  public param: {
    id: number;
    name: string;
    color?: string;
    sync?: "Last" | "LastEachGate";
  };

  public tags: {
    value?: Value;
    gate?: Gate;
    data?: Data;
    memo?: string;
  };

  constructor(
    param: typeof CCM.prototype.param,
    tags: typeof CCM.prototype.tags = {},
  ) {
    this.param = param;
    this.tags = tags;
  }

  check() {
    if (this.param.id < 0 || this.param.id > 1300) {
      throw new DominoError(
        `CCM ID must be between 0 and 1300. Received: ${this.param.id}`,
      );
    }
    if (this.param.color?.startsWith("#") === false) {
      throw new DominoError(
        `CCM Color must start with #. Received: ${this.param.color}`,
      );
    }
  }

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "CCM",
      attributes: {
        "ID": this.param.id,
        "Name": this.param.name,
        "Color": this.param.color,
        "Sync": this.param.sync,
      },
      elements: [],
    };
    Object.values(this.tags).map((tag) => {
      if (typeof tag === "string") {
        element.elements.push(
          {
            type: "element",
            name: "Memo",
            elements: [{ type: "text", text: tag }],
          },
        );
      } else {
        element.elements.push(tag.toXMLElement());
      }
    });

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "ID": id, "Name": name, "Color": color, "Sync": sync } =
      element.attributes || {};

    if (typeof id !== "number") {
      throw new DominoError("Invalid XML: Not found CCM ID");
    }
    if (name === undefined) {
      throw new DominoError("Invalid XML: Not found CCM Name");
    }
    const param: ConstructorParameters<typeof this>[0] = {
      id,
      name: String(name),
    };

    if (color !== undefined) {
      if (typeof color !== "string") {
        throw new DominoError("Invalid XML: Not found CCM Color");
      } else param.color = color;
    }
    if (sync !== undefined) {
      if (sync !== "Last" && sync !== "LastEachGate") {
        throw new DominoError("Invalid XML: Not found CCM Sync");
      } else param.sync = sync;
    }

    const tags: ConstructorParameters<typeof this>[1] = {};
    element.elements
      .forEach((e) => {
        if (e.type !== "element") return;
        switch (e.name) {
          case "Value":
            tags.value = Value.fromXMLElement(e);
            break;
          case "Gate":
            tags.gate = Gate.fromXMLElement(e);
            break;
          case "Data": {
            const textElement = e.elements[0];
            if (textElement?.type === "text") {
              tags.data = Data.fromXMLElements(textElement.text);
            } else {
              tags.data = Data.fromXMLElements("");
            }
            break;
          }
          case "Memo": {
            const textElement = e.elements[0];
            if (textElement?.type === "text") tags.memo = textElement.text;
            else tags.memo = "";
            break;
          }
        }
      });

    const ccm = new this(param, tags);
    return ccm;
  }
}

export class CCMLink implements Base {
  public param: {
    id: number;
    value?: number;
    gate?: number;
  };

  constructor(
    param: typeof CCMLink.prototype.param,
  ) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "CCMLink",
      attributes: {
        "ID": this.param.id,
        "Value": this.param.value,
        "Gate": this.param.gate,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "ID": id, "Value": value, "Gate": gate } = element.attributes || {};

    if (id === undefined || typeof id !== "number") {
      throw new DominoError("Invalid XML: Not found CCMLink ID");
    }
    const param: ConstructorParameters<typeof CCMLink>[0] = { id };
    if (value !== undefined) {
      if (typeof value !== "number") {
        throw new DominoError("Invalid XML: Not found CCMLink Value");
      } else param.value = value;
    }
    if (gate !== undefined) {
      if (typeof gate !== "number") {
        throw new DominoError("Invalid XML: Not found CCMLink Gate");
      } else param.gate = gate;
    }

    const ccmLink = new this(param);
    return ccmLink;
  }
}

export class Value implements Base {
  public param: {
    default?: number;
    min?: number;
    max?: number;
    offset?: number;
    name?: string;
    type?: "Key";
    tableId?: number;
  };
  public tags?: Entry[];

  constructor(param: typeof Value.prototype.param = {}, tags?: Entry[]) {
    this.param = param;
    this.tags = tags;
  }

  check() {
    this.tags?.forEach((tag) => {
      const { min, max } = this.param;
      if (
        (min !== undefined && tag.param.value < min) ||
        (max !== undefined && tag.param.value > max)
      ) {
        throw new DominoError(
          `Entry Value must be between ${min} and ${max}. Received ${tag.param.value}`,
        );
      }
    });
  }

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Value",
      attributes: {
        "Default": this.param.default,
        "Min": this.param.min,
        "Max": this.param.max,
        "Offset": this.param.offset,
        "Name": this.param.name,
        "Type": this.param.type,
        "TableID": this.param.tableId,
      },
      elements: [],
    };

    if (this.tags) {
      element.elements.push(...this.tags.map((tag) => tag.toXMLElement()));
    }
    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const {
      "Default": defaultValue,
      "Min": min,
      "Max": max,
      "Offset": offset,
      "Name": name,
      "Type": type,
      "TableID": tableId,
    } = element.attributes || {};

    const param: ConstructorParameters<typeof this>[0] = {};
    if (defaultValue !== undefined) {
      if (typeof defaultValue !== "number") {
        throw new DominoError("Invalid XML: Not found Value Default");
      } else param.default = defaultValue;
    }
    if (min !== undefined) {
      if (typeof min !== "number") {
        throw new DominoError("Invalid XML: Not found Value Min");
      } else param.min = min;
    }
    if (max !== undefined) {
      if (typeof max !== "number") {
        throw new DominoError("Invalid XML: Not found Value Max");
      } else param.max = max;
    }
    if (offset !== undefined) {
      if (typeof offset !== "number") {
        throw new DominoError("Invalid XML: Not found Value Offset");
      } else param.offset = offset;
    }
    if (name !== undefined) {
      param.name = String(name);
    }
    if (type !== undefined) {
      if (type !== "Key") {
        throw new DominoError("Invalid XML: Not found Value Type");
      } else param.type = type;
    }
    if (tableId !== undefined) {
      if (typeof tableId !== "number") {
        throw new DominoError("Invalid XML: Not found Value TableID");
      } else param.tableId = tableId;
    }

    const entries: Entry[] = element.elements.flatMap((e) => {
      if (e.type === "element") return Entry.fromXMLElement(e);
      return [];
    });

    const value = new this(param, entries);
    return value;
  }
}

export class Gate extends Value {
  override toXMLElement() {
    const element = super.toXMLElement();
    element.name = "Gate";
    return element;
  }
}

export class Entry implements Base {
  public param: {
    label: string;
    value: number;
  };

  constructor(param: typeof Entry.prototype.param) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Entry",
      attributes: {
        "Label": this.param.label,
        "Value": this.param.value,
      },
      elements: [],
    };
    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "Label": label, "Value": value } = element.attributes || {};

    if (label === undefined) {
      throw new DominoError("Invalid XML: Not found Entry Label");
    }
    if (value === undefined || typeof value !== "number") {
      throw new DominoError("Invalid XML: Not found Entry Value");
    }

    const entry = new this({ label: String(label), value });
    return entry;
  }
}

export class Table implements Base {
  public param: { id: number };
  public tags: Entry[];

  constructor(param: typeof Table.prototype.param, tags?: Entry[]) {
    this.param = param;
    this.tags = tags || [];
  }

  check() {
    if (this.param.id < 0) {
      throw new DominoError(
        `Table ID must be 0 or more. Received: ${this.param.id}`,
      );
    }
  }

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Table",
      attributes: {
        "ID": this.param.id,
      },
      elements: this.tags.map((tag) => tag.toXMLElement()),
    };
    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "ID": id } = element.attributes || {};

    if (id === undefined || typeof id !== "number") {
      throw new DominoError("Invalid XML: Not found Table ID");
    }

    const tags: ConstructorParameters<typeof this>[1] = element.elements
      .flatMap(
        (e) => {
          if (e.type === "element") return [Entry.fromXMLElement(e)];
          return [];
        },
      );

    const table = new this({ id }, tags);
    return table;
  }
}

export class Data implements Base {
  public text: string;
  constructor(text: string) {
    this.text = text;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Data",
      elements: [
        { type: "text", text: this.text },
      ],
    };
    return element;
  }

  static fromXMLElements(node: string) {
    const data = new this(node);
    return data;
  }
}

export class TemplateFolder implements Base {
  public param: {
    name: string;
  };
  public tags: (Template | TemplateFolder)[];

  constructor(
    param: typeof TemplateFolder.prototype.param,
    tags?: typeof TemplateFolder.prototype.tags,
  ) {
    this.param = param;
    this.tags = tags || [];
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Folder",
      attributes: {
        "Name": this.param.name,
      },
      elements: this.tags.map((tag) => tag.toXMLElement()),
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "Name": name } = element.attributes || {};

    if (name === undefined) {
      throw new DominoError("Invalid XML: Not found Folder Name");
    }

    const tags: TemplateFolder["tags"] = [];
    element.elements.forEach((e) => {
      if (e.type !== "element") return;
      if (e.name === "Template") {
        tags.push(Template.fromXMLElement(e));
      } else if (e.name === "Folder") {
        tags.push(TemplateFolder.fromXMLElement(e));
      } else return;
    });

    const folder = new this({ name: String(name) }, tags);
    return folder;
  }
}

export class Template implements Base {
  public param: { id?: number; name: string };
  public tags: (Memo | CC | TemplatePC | Comment)[];

  constructor(
    param: typeof Template.prototype.param,
    tags?: typeof Template.prototype.tags,
  ) {
    this.param = param;
    this.tags = tags || [];
  }

  check() {
    if (this.param.id !== undefined && this.param.id < 0) {
      throw new DominoError(
        `Template ID must be 0 or more. Received: ${this.param.id}`,
      );
    }
  }

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Template",
      attributes: {
        "ID": this.param.id,
        "Name": this.param.name,
      },
      elements: this.tags.map((tag) => tag.toXMLElement()),
    };
    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "Name": name, "ID": id } = element.attributes || {};

    if (name === undefined) {
      throw new DominoError("Invalid XML: Not found Template Name");
    }
    const params: ConstructorParameters<typeof this>[0] = {
      name: String(name),
    };
    if (id !== undefined) {
      if (typeof id !== "number") {
        throw new DominoError("Invalid XML: Not found Template ID");
      } else params.id = id;
    }

    const tags: ConstructorParameters<typeof this>[1] = [];
    element.elements
      .forEach((e) => {
        if (e.type !== "element") return;
        switch (e.name) {
          case "CC":
            tags.push(CC.fromXMLElement(e));
            break;
          case "Memo":
            tags.push(Memo.fromXMLElement(e));
            break;
          case "PC":
            tags.push(TemplatePC.fromXMLElement(e));
            break;
          case "Comment":
            tags.push(Comment.fromXMLElement(e));
            break;
        }
      });

    const template = new this(params, tags);
    return template;
  }
}

export class CC implements Base {
  public param: { id: number; value?: number; gate?: number };

  constructor(param: typeof CC.prototype.param) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "CC",
      attributes: {
        "ID": this.param.id,
        "Value": this.param.value,
        "Gate": this.param.gate,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "ID": id, "Value": value, "Gate": gate } = element.attributes || {};

    if (id === undefined || typeof id !== "number") {
      throw new DominoError("Invalid XML: Not found CC ID");
    }

    const params: ConstructorParameters<typeof this>[0] = {
      id,
    };
    if (value !== undefined) {
      if (typeof value !== "number") {
        throw new DominoError("Invalid XML: Not found CC Value");
      } else params.value = value;
    }
    if (gate !== undefined) {
      if (typeof gate !== "number") {
        throw new DominoError("Invalid XML: Not found CC Gate");
      } else params.gate = gate;
    }

    const cc = new this(params);
    return cc;
  }
}

export class Memo implements Base {
  public text: string;

  constructor(text: string) {
    this.text = text;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Memo",
      elements: [{ type: "text", text: this.text }],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const textElement = element.elements[0];
    let text = "";
    if (textElement?.type === "text") text = textElement.text;

    const memo = new this(text);
    return memo;
  }
}

export class TemplatePC implements Base {
  public param: {
    pc?: number;
    msb?: number;
    lsb?: number;
    mode?: "Drumset" | "Auto";
  };

  constructor(param: Partial<typeof TemplatePC.prototype.param>) {
    this.param = param;
  }

  check() {
    if (
      this.param.pc !== undefined &&
      (this.param.pc <= 0 || this.param.pc >= 129)
    ) {
      throw new DominoError(
        `PC PC must be 1 or more less than 128. Received: ${this.param.pc}`,
      );
    }
  }

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "PC",
      attributes: {
        "PC": this.param.pc,
        "MSB": this.param.msb,
        "LSB": this.param.lsb,
        "Mode": this.param.mode,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "PC": pc, "MSB": msb, "LSB": lsb, "Mode": mode } =
      element.attributes || {};

    if (pc !== undefined && typeof pc !== "number") {
      throw new DominoError("Invalid XML: Not found PC PC");
    }

    const params: ConstructorParameters<typeof this>[0] = {
      pc,
    };
    if (msb !== undefined) {
      if (typeof msb !== "number") {
        throw new DominoError("Invalid XML: Not found PC MSB");
      } else params.msb = msb;
    }
    if (lsb !== undefined) {
      if (typeof lsb !== "number") {
        throw new DominoError("Invalid XML: Not found PC LSB");
      } else params.lsb = lsb;
    }
    if (mode !== undefined) {
      if (mode !== "Drumset" && mode !== "Auto") {
        throw new DominoError("Invalid XML: PC Mode is not Drumset or Auto");
      } else params.mode = mode;
    }

    const pcTag = new this(params);
    return pcTag;
  }
}

export class Comment implements Base {
  public param: {
    text?: string;
  };

  constructor(param: typeof Comment.prototype.param) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Comment",
      attributes: { "Text": this.param.text },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "Text": text } = element.attributes || {};

    const comment = new this({
      text: text === undefined ? undefined : String(text),
    });
    return comment;
  }
}

export class Mark implements Base {
  public param: {
    meas: number;
    name?: string;
  };

  constructor(param: typeof Mark.prototype.param) {
    this.param = param;
  }

  check() {
    if (this.param.meas <= 0) {
      throw new DominoError(
        `Mark Meas must be 1 or more. Received: ${this.param.meas}`,
      );
    }
  }

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Mark",
      attributes: {
        "Meas": this.param.meas,
        "Name": this.param.name,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "Meas": meas, "Name": name } = element.attributes || {};

    if (meas === undefined || typeof meas !== "number") {
      throw new DominoError("Invalid XML: Not found Mark Meas");
    }

    const mark = new this({
      meas,
      name: name === undefined ? undefined : String(name),
    });
    return mark;
  }
}

export class Track implements Base {
  public param: {
    name?: string;
    ch?: number;
    mode?: "Conductor" | "Rhythm";
    current?: number;
  };

  public tags: (
    | DefaultDataTrackMark
    | Tempo
    | TimeSignature
    | KeySignature
    | DefaultDataCC
    | DefaultDataPC
    | DefaultDataComment
    | DefaultDataTemplate
    | EOT
  )[];

  constructor(
    param: typeof Track.prototype.param,
    tags: typeof Track.prototype.tags,
  ) {
    this.param = param;
    this.tags = tags;
  }

  check() {
    if (
      this.param.ch !== undefined && (this.param.ch <= 0 || this.param.ch > 16)
    ) {
      throw new DominoError(
        `Track Ch must be 1 or more and 16 or less. Received: ${this.param.ch}`,
      );
    }
  }

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Track",
      attributes: {
        "Name": this.param.name,
        "Ch": this.param.ch,
        "Mode": this.param.mode,
        "Current": this.param.current,
      },
      elements: this.tags.map((tag) => tag.toXMLElement()),
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "Name": name, "Ch": ch, "Mode": mode, "Current": current } =
      element.attributes || {};

    if (ch !== undefined && typeof ch !== "number") {
      throw new DominoError("Invalid XML: Not found Track Ch");
    }
    if (mode !== undefined) {
      if (mode !== "Conductor" && mode !== "Rhythm") {
        throw new DominoError("Invalid XML: Not found Track Mode");
      }
    }
    if (current !== undefined && typeof current !== "number") {
      throw new DominoError("Invalid XML: Not found Track Current");
    }

    const tags: ConstructorParameters<typeof this>[1] = [];
    element.elements
      .forEach((e) => {
        if (e.type !== "element") return;
        switch (e.name) {
          case "Mark":
            tags.push(DefaultDataTrackMark.fromXMLElement(e));
            break;
          case "Tempo":
            tags.push(Tempo.fromXMLElement(e));
            break;
          case "TimeSignature":
            tags.push(TimeSignature.fromXMLElement(e));
            break;
          case "KeySignature":
            tags.push(KeySignature.fromXMLElement(e));
            break;
          case "CC":
            tags.push(DefaultDataCC.fromXMLElement(e));
            break;
          case "PC":
            tags.push(DefaultDataPC.fromXMLElement(e));
            break;
          case "Comment":
            tags.push(DefaultDataComment.fromXMLElement(e));
            break;
          case "Template":
            tags.push(DefaultDataTemplate.fromXMLElement(e));
            break;
          case "EOT":
            tags.push(EOT.fromXMLElement(e));
            break;
        }
      });

    const track = new this({
      name: name === undefined ? undefined : String(name),
      ch,
      mode,
      current,
    }, tags);
    return track;
  }
}

export class DefaultDataTrackMark implements Base {
  public param: { name?: string; tick?: number; step?: number };

  constructor(param: typeof DefaultDataTrackMark.prototype.param) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Mark",
      attributes: {
        "Name": this.param.name,
        "Tick": this.param.tick,
        "Step": this.param.step,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "Name": name, "Tick": tick, "Step": step } = element.attributes ||
      {};

    if (tick !== undefined && typeof tick !== "number") {
      throw new DominoError("Invalid XML: Not found TimeSignature Tick");
    }
    if (step !== undefined && typeof step !== "number") {
      throw new DominoError("Invalid XML: Not found TimeSignature Step");
    }

    const t = new this({
      name: name === undefined ? undefined : String(name),
      tick,
      step,
    });
    return t;
  }
}

export class Tempo implements Base {
  public param: { tempo: number; tick?: number; step?: number };

  constructor(param: typeof Tempo.prototype.param) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Tempo",
      attributes: {
        "Tempo": this.param.tempo.toFixed(3),
        "Tick": this.param.tick,
        "Step": this.param.step,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "Tempo": tempo, "Tick": tick, "Step": step } = element.attributes ||
      {};

    if (tempo === undefined || typeof tempo !== "number") {
      throw new DominoError(
        "Invalid XML: Not found Tempo Tempo",
      );
    }
    if (tick !== undefined && typeof tick !== "number") {
      throw new DominoError("Invalid XML: Not found Tempo Tick");
    }
    if (step !== undefined && typeof step !== "number") {
      throw new DominoError("Invalid XML: Not found Tempo Step");
    }

    const t = new this({ tempo, tick, step });
    return t;
  }
}

export class TimeSignature implements Base {
  public param: { timeSignature: string; tick?: number; step?: number };

  constructor(param: typeof TimeSignature.prototype.param) {
    this.param = param;
  }

  check() {
    const signature = this.param.timeSignature.split("/");
    for (const s of signature) {
      if (/^\d+$/.test(s) === false) {
        throw new DominoError(
          "TimeSignature TimeSignature does not follow format. Received: " +
            this.param.timeSignature,
        );
      }
    }
  }

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "TimeSignature",
      attributes: {
        "TimeSignature": this.param.timeSignature,
        "Tick": this.param.tick,
        "Step": this.param.step,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "TimeSignature": timeSignature, "Tick": tick, "Step": step } =
      element.attributes ||
      {};

    if (timeSignature === undefined || typeof timeSignature !== "string") {
      throw new DominoError(
        "Invalid XML: Not found TimeSignature TimeSignature",
      );
    }
    if (tick !== undefined && typeof tick !== "number") {
      throw new DominoError("Invalid XML: Not found TimeSignature Tick");
    }
    if (step !== undefined && typeof step !== "number") {
      throw new DominoError("Invalid XML: Not found TimeSignature Step");
    }

    const t = new this({ timeSignature, tick, step });
    return t;
  }
}

export class KeySignature implements Base {
  public param: { keySignature: string; tick?: number; step?: number };

  constructor(param: typeof KeySignature.prototype.param) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "KeySignature",
      attributes: {
        "KeySignature": this.param.keySignature,
        "Tick": this.param.tick,
        "Step": this.param.step,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "KeySignature": keySignature, "Tick": tick, "Step": step } =
      element.attributes ||
      {};

    if (keySignature === undefined || typeof keySignature !== "string") {
      throw new DominoError(
        "Invalid XML: Not found KeySignature KeySignature",
      );
    }
    if (tick !== undefined && typeof tick !== "number") {
      throw new DominoError("Invalid XML: Not found KeySignature Tick");
    }
    if (step !== undefined && typeof step !== "number") {
      throw new DominoError("Invalid XML: Not found KeySignature Step");
    }

    const t = new this({ keySignature, tick, step });
    return t;
  }
}

export class DefaultDataCC implements Base {
  public param: {
    id: number;
    value?: number;
    gate?: number;
    tick?: number;
    step?: number;
  };

  constructor(param: typeof DefaultDataCC.prototype.param) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "CC",
      attributes: {
        "ID": this.param.id,
        "Value": this.param.value,
        "Gate": this.param.gate,
        "Tick": this.param.tick,
        "Step": this.param.step,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const {
      "ID": id,
      "Value": value,
      "Gate": gate,
      "Tick": tick,
      "Step": step,
    } = element.attributes || {};

    if (id === undefined || typeof id !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData CC Name");
    }
    if (value !== undefined && typeof value !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData CC Value");
    }
    if (gate !== undefined && typeof gate !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData CC Gate");
    }
    if (tick !== undefined && typeof tick !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData CC Tick");
    }
    if (step !== undefined && typeof step !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData CC Step");
    }

    const cc = new this({ id, value, gate, tick, step });
    return cc;
  }
}

export class DefaultDataPC implements Base {
  public param: {
    pc?: number;
    msb?: number;
    lsb?: number;
    mode?: "Drumset" | "Auto";
    tick?: number;
    step?: number;
  };

  constructor(param: typeof DefaultDataPC.prototype.param) {
    this.param = param;
  }

  check() {
    if (this.param.pc !== undefined) {
      if (this.param.pc <= 0 || this.param.pc > 128) {
        throw new DominoError(
          `DefaultData PC PC must be 1 or more and 128 or less. Received: ${this.param.pc}`,
        );
      }
    }
  }

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "PC",
      attributes: {
        "PC": this.param.pc,
        "MSB": this.param.msb,
        "LSB": this.param.lsb,
        "Mode": this.param.mode,
        "Tick": this.param.tick,
        "Step": this.param.step,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const {
      "PC": pc,
      "MSB": msb,
      "LSB": lsb,
      "Mode": mode,
      "Tick": tick,
      "Step": step,
    } = element.attributes || {};

    if (pc !== undefined && typeof pc !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData PC PC");
    }
    if (msb !== undefined && typeof msb !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData PC MSB");
    }
    if (lsb !== undefined && typeof lsb !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData PC LSB");
    }
    if (mode !== undefined && mode !== "Drumset" && mode !== "Auto") {
      throw new DominoError("Invalid XML: Not found DefaultData PC Mode");
    }
    if (tick !== undefined && typeof tick !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData PC Tick");
    }
    if (step !== undefined && typeof step !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData PC Step");
    }

    const defaultDataPc = new this({ pc, msb, lsb, mode, tick, step });
    return defaultDataPc;
  }
}

export class DefaultDataComment implements Base {
  public param: { text?: string; tick?: number; step?: number };

  constructor(param: typeof DefaultDataComment.prototype.param) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Comment",
      attributes: {
        "Text": this.param.text,
        "Tick": this.param.tick,
        "Step": this.param.step,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "Text": text, "Tick": tick, "Step": step } = element.attributes ||
      {};

    if (tick !== undefined && typeof tick !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData Comment Tick");
    }
    if (step !== undefined && typeof step !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData Comment Step");
    }

    const comment = new this({
      text: text === undefined ? undefined : String(text),
      tick,
      step,
    });
    return comment;
  }
}

export class DefaultDataTemplate implements Base {
  public param: { id?: number; tick?: number; step?: number };

  constructor(param: typeof DefaultDataTemplate.prototype.param) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "Template",
      attributes: {
        "ID": this.param.id,
        "Tick": this.param.tick,
        "Step": this.param.step,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "ID": id, "Tick": tick, "Step": step } = element.attributes ||
      {};

    if (id !== undefined && typeof id !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData Template ID");
    }
    if (tick !== undefined && typeof tick !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData Template Tick");
    }
    if (step !== undefined && typeof step !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData Template Step");
    }

    const template = new this({ id, tick, step });
    return template;
  }
}

export class EOT implements Base {
  public param: { tick?: number };

  constructor(param: typeof EOT.prototype.param) {
    this.param = param;
  }

  check() {}

  toXMLElement() {
    this.check();
    const element: ElementElement = {
      type: "element",
      name: "EOT",
      attributes: {
        "Tick": this.param.tick,
      },
      elements: [],
    };

    return element;
  }

  static fromXMLElement(element: ElementElement) {
    const { "Tick": tick } = element.attributes || {};

    if (tick !== undefined && typeof tick !== "number") {
      throw new DominoError("Invalid XML: Not found DefaultData Template Tick");
    }
    const eot = new this({ tick });
    return eot;
  }
}

interface Base {
  check(): void;
  toXMLElement(): ElementElement;
}
