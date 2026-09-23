import {sqliteTable,text,integer} from "drizzle-orm/sqlite-core";
export const workspace = sqliteTable("workspace",{id:text("id").primaryKey(),payload:text("payload").notNull(),version:integer("version").notNull().default(0)});
export const files=sqliteTable("files",{id:text("id").primaryKey(),owner:text("owner").notNull(),name:text("name").notNull(),type:text("type").notNull(),size:integer("size").notNull()});
