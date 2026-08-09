import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	activeConnectionId: integer('active_connection_id'),
	createdAt: integer('created_at')
		.notNull()
		.$defaultFn(() => Date.now())
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull()
});

export const connections = sqliteTable('connections', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	serverUrl: text('server_url').notNull(),
	username: text('username').notNull(),
	password: text('password').notNull(),
	createdAt: integer('created_at')
		.notNull()
		.$defaultFn(() => Date.now())
});

export const favorites = sqliteTable(
	'favorites',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		connectionId: integer('connection_id')
			.notNull()
			.references(() => connections.id, { onDelete: 'cascade' }),
		streamType: text('stream_type').notNull(), // 'live' | 'movie' | 'series'
		streamId: integer('stream_id').notNull(),
		name: text('name').notNull(),
		icon: text('icon'),
		ext: text('ext'),
		createdAt: integer('created_at')
			.notNull()
			.$defaultFn(() => Date.now())
	},
	(t) => [uniqueIndex('fav_unique').on(t.userId, t.connectionId, t.streamType, t.streamId)]
);

export const watchProgress = sqliteTable(
	'watch_progress',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		connectionId: integer('connection_id')
			.notNull()
			.references(() => connections.id, { onDelete: 'cascade' }),
		streamType: text('stream_type').notNull(), // 'movie' | 'episode' | 'live'
		streamId: integer('stream_id').notNull(),
		seriesId: integer('series_id'),
		name: text('name').notNull(),
		icon: text('icon'),
		ext: text('ext'),
		position: real('position').notNull().default(0),
		duration: real('duration').notNull().default(0),
		updatedAt: integer('updated_at')
			.notNull()
			.$defaultFn(() => Date.now())
	},
	(t) => [uniqueIndex('progress_unique').on(t.userId, t.connectionId, t.streamType, t.streamId)]
);

export const pinnedCategories = sqliteTable(
	'pinned_categories',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		connectionId: integer('connection_id')
			.notNull()
			.references(() => connections.id, { onDelete: 'cascade' }),
		contentType: text('content_type').notNull(), // 'live' | 'vod' | 'series'
		categoryId: text('category_id').notNull(),
		createdAt: integer('created_at')
			.notNull()
			.$defaultFn(() => Date.now())
	},
	(t) => [uniqueIndex('pin_unique').on(t.userId, t.connectionId, t.contentType, t.categoryId)]
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Connection = typeof connections.$inferSelect;
export type Favorite = typeof favorites.$inferSelect;
export type WatchProgress = typeof watchProgress.$inferSelect;
export type PinnedCategory = typeof pinnedCategories.$inferSelect;
