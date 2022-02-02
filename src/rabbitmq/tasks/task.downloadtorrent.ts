import { Channel, ChannelWrapper } from 'amqp-connection-manager';
import { ConsumeMessage } from 'amqplib';
import { ITorrent, TorrentPath, IVideo, QueueName } from '../../@types';
import {
  IConvertVideoMessageContent,
  IMoveFilesMessageContent,
  ITorrentDownloadStatusMessageContent,
} from '../../@types/message';
import logger from '../../config/logger';
import client from '../../config/webtorrent';
import { allowedExt, convertableExt, getFileOutputPath, getMessageContent } from '../../utils/misc';
import { updateNoMediaTorrent, updateTorrentInfo } from '../../utils/query';

export const downloadTorrent =
  (channel: Channel, publisherChannel: ChannelWrapper) =>
  async (message: ConsumeMessage | null): Promise<void> => {
    if (!message) return;
    try {
      const addedTorrent: ITorrent = getMessageContent<ITorrent>(message);
      logger.info({ message: 'Received new torrent to download..', addedTorrent });
      //! change path after convert
      client.add(addedTorrent.magnet, { path: TorrentPath.TMP }, async torrent => {
        const videofiles = torrent.files
          .map(file => {
            const ext = file.name.split('.').pop() || '';
            const isVideoFile = allowedExt.has(ext);
            const isConvertable = convertableExt.has(ext);
            if (!isVideoFile) {
              logger.info({ message: "found file that's not video file", file });
              file.deselect();
            }
            return {
              name: file.name,
              path: file.path,
              size: file.length,
              ext,
              isConvertable,
              status: 'downloading',
            } as IVideo;
            // return addVideoFiles(addedTorrent._id, torrentfile);
          })
          .filter(file => allowedExt.has(file.ext));

        if (videofiles.length === 0) {
          torrent.destroy({ destroyStore: true });
          logger.info({ message: 'no video files found, deleting torrent', addedTorrent });
          // eslint-disable-next-line no-underscore-dangle
          updateNoMediaTorrent(addedTorrent._id);
          channel.ack(message);
        } else {
          const { name, infoHash, length: size } = torrent;
          const isMultiVideos = videofiles.length > 1;
          const SavedTorrent = await updateTorrentInfo(addedTorrent._id, {
            name,
            infoHash,
            size,
            isMultiVideos,
            files: videofiles,
            status: 'downloading',
          });

          //* publish a message to track this torrent's download status and save td db
          publisherChannel.sendToQueue(QueueName.TRACK_TORRENT, {
            torrentID: SavedTorrent._id,
            torrentInfoHash: SavedTorrent.infoHash,
          } as ITorrentDownloadStatusMessageContent);
          torrent.on('done', async () => {
            await updateTorrentInfo(addedTorrent._id, {
              status: 'done',
            });
            const convertableVideoFiles = SavedTorrent.files.filter(file => file.isConvertable);
            const nonConvertableVideoFiles = SavedTorrent.files.filter(file => !file.isConvertable);
            if (convertableVideoFiles.length > 0) {
              //* sending all convertable files to convert-video queue
              convertableVideoFiles.map(file =>
                publisherChannel.sendToQueue(QueueName.CONVERT_VIDEO, {
                  torrentID: SavedTorrent._id,
                  ...file,
                } as IConvertVideoMessageContent)
              );
            }
            await Promise.all(
              nonConvertableVideoFiles.map(file =>
                publisherChannel.sendToQueue(QueueName.FILE_MOVE, {
                  src: file.path,
                  dest: getFileOutputPath(file.name, TorrentPath.DOWNLOAD),
                  torrentID: SavedTorrent._id,
                  fileSlug: file.slug,
                } as IMoveFilesMessageContent)
              )
            );
            channel.ack(message);
            logger.info(`${SavedTorrent.name} torrent downloaded now deleting torrent`);
            torrent.destroy();
          });
        }
      });
    } catch (error) {
      logger.error({ message: 'Something went wrong while downloading torrent..', error });
      channel.ack(message);
    }
  };
