/* eslint-disable unicorn/no-null */
import { Document } from 'mongoose';
import { ConvertState, IDownloadInfo, ISubtitle, ITorrent, IVideo, TorrentStatus } from '../@types';
import logger from '../config/logger';
import { TorrentModel } from '../models/torrent.schema';

const allowedExt = new Set(['mp4', 'mkv', 'avi']);

export const createTorrentWithMagnet = async (magnet: string): Promise<Document> => {
  const doc = new TorrentModel({ magnet, status: 'added' });
  return doc.save();
};

export const getVideoFiles = async (_id: string): Promise<IVideo[] | null> => {
  const doc = await TorrentModel.findOne({ _id });
  if (!doc) return null;
  return doc.files.filter(file => allowedExt.has(file.ext));
};

export const clearTorrents = async (): Promise<void> => {
  await TorrentModel.deleteMany({});
};

export const updateTorrentInfo = async (_id: string, data: Partial<ITorrent>): Promise<ITorrent | null> => {
  try {
    const doc = await TorrentModel.findOneAndUpdate({ _id }, data, { lean: true, new: true });
    if (doc) return doc;
    return null;
  } catch (error) {
    logger.error(error);
    return null;
  }
};

export const updateTorrentFileStatus = async (_id: string, slug: string, status: TorrentStatus): Promise<void> => {
  await TorrentModel.updateOne({ _id, 'files.slug': slug }, { $set: { 'files.$.status': status } });
};

export const updateTorrentFileConvertable = async (_id: string, slug: string, bool: boolean): Promise<void> => {
  await TorrentModel.updateOne({ _id, 'files.slug': slug }, { $set: { 'files.$.isConvertable': bool } });
};

export const updateFileConvertProgress = async (
  _id: string,
  slug: string,
  progress: number,
  state: ConvertState
): Promise<void> => {
  try {
    await TorrentModel.updateOne(
      { _id, 'files.slug': slug },
      { $set: { 'files.$.convertStatus': { progress, state } } }
    );
  } catch (error) {
    logger.error(error);
  }
};

export const doesTorrentAlreadyExist = async (magnet: string): Promise<boolean> => {
  const doc = await TorrentModel.findOne({ magnet });
  if (!doc) return false;
  return true;
};

export const updateTorrentDownloadInfo = async (_id: string, downloadInfo: IDownloadInfo): Promise<void> => {
  try {
    await TorrentModel.findByIdAndUpdate(_id, { $set: { downloadInfo } });
  } catch (error) {
    logger.error(error);
  }
};

export const updateFilePath = async (_id: string, slug: string, path: string): Promise<void> => {
  try {
    await TorrentModel.updateOne({ _id, 'files.slug': slug }, { $set: { 'files.$.path': path } });
  } catch (error) {
    logger.error(error);
  }
};

export const getTorrentBySlug = async (slug: string): Promise<ITorrent | null> => {
  try {
    const doc = await TorrentModel.findOne({ slug }).lean();
    if (!doc) return null;
    return doc;
  } catch (error) {
    logger.error(error);
    throw new Error('something went wrong while fetching torrent by slug');
  }
};

export const getTorrentByMagnet = async (magnet: string): Promise<ITorrent | null> => {
  try {
    const doc = await TorrentModel.findOne({ magnet });
    if (!doc) return null;
    return doc;
  } catch (error) {
    logger.error(error);
    throw new Error('something went wrong while fetching torrent by magnet');
  }
};

export const deleteTorrentByID = async (_id: string): Promise<void> => {
  try {
    await TorrentModel.deleteOne({ _id });
  } catch (error) {
    logger.error(error);
  }
};

//! need pagination later
export const getAllTorrentsFromDB = async (): Promise<ITorrent[]> => {
  try {
    const docs = await TorrentModel.find({}).select('-files').limit(20).lean(true);
    if (!docs) return [];
    return docs;
  } catch (error) {
    logger.error(error);
    throw new Error('something went wrong while fetching all torrents');
  }
};

export const getVideoFile = async (videoSlug: string): Promise<IVideo | null | undefined> => {
  try {
    const doc = await TorrentModel.findOne({ 'files.slug': videoSlug }).lean(true);
    if (!doc) return null;
    return doc.files.find(file => file.slug === videoSlug && file.status === 'done');
  } catch (error) {
    logger.error(error);
    throw new Error('something went wrong while fetching video file');
  }
};

export const addSubtitleFile = async (_id: string, fileSlug: string, subtitleInfo: ISubtitle): Promise<void> => {
  try {
    await TorrentModel.updateOne({ _id, 'files.slug': fileSlug }, { $push: { 'files.$.subtitles': subtitleInfo } });
  } catch (error) {
    logger.error(error);
  }
};
