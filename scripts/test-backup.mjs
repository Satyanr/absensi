import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/sh';
const localPath = value => path.relative(process.cwd(),value).replaceAll('\\','/');
const stub = `#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = '-f' ]; then output=$2; shift; fi
  shift
done
printf 'dump data' > "$output"
exit "\${MOCK_DUMP_EXIT:-0}"
`;
for (const failAt of ['none', 'database', 'archive']) {
  test(`backup ${failAt === 'none' ? 'publishes complete files before rotation' : `failure at ${failAt} keeps previous backups`}`, () => {
    const root = fs.mkdtempSync(path.join(process.cwd(), '.backup-test-'));
    try {
      const bin = path.join(root,'bin');
      const backups = path.join(root,'backups');
      const photos = path.join(root,'photos');
      const leave = path.join(root,'leave');
      const archive = path.join(root,'archive');
      for (const dir of [bin,backups,photos,leave,archive]) fs.mkdirSync(dir);
      fs.writeFileSync(path.join(bin,'pg_dump'),stub,{mode:0o755});
      fs.writeFileSync(path.join(bin,'tar'),`#!/bin/sh\nif [ "\${MOCK_TAR_EXIT:-0}" != '0' ]; then exit 1; fi\nexec /usr/bin/tar "$@"\n`,{mode:0o755});
      fs.writeFileSync(path.join(photos,'photo.jpg'),'photo');
      fs.writeFileSync(path.join(leave,'form.pdf'),'document');
      fs.writeFileSync(path.join(archive,'old-photo.jpg'),'old photo');
      for(const name of ['db-old.dump','important.txt']) {
        const file=path.join(backups,name);
        fs.writeFileSync(file,'previous');
        const old = new Date(Date.now() - 20 * 86400000);
        fs.utimesSync(file,old,old);
      }
      const result=spawnSync(shell,['-c','PATH="$PWD/$1:$PATH"; export PATH; exec /bin/sh "$2" --once','backup-test',localPath(bin),'scripts/backup.sh'],{
        encoding:'utf8',
        env:{...process.env,BACKUP_DIR:localPath(backups),BACKUP_PHOTOS_DIR:localPath(photos),BACKUP_LEAVE_DIR:localPath(leave),BACKUP_ARCHIVE_DIR:localPath(archive),POSTGRES_DB:'test',POSTGRES_USER:'test',POSTGRES_PASSWORD:'test',MOCK_DUMP_EXIT:failAt==='database'?'1':'0',MOCK_TAR_EXIT:failAt==='archive'?'1':'0'},
      });
      if(result.error) throw result.error;
      assert.equal(result.status,failAt==='none'?0:1,result.stderr);
      const files=fs.readdirSync(backups);
      assert.ok(!files.some(file=>file.endsWith('.partial')));
      assert.ok(files.includes('important.txt'));
      if(failAt==='none') {
        assert.ok(!files.includes('db-old.dump'));
        assert.equal(files.filter(file=>file.endsWith('.dump')).length,1);
        assert.equal(files.filter(file=>file.endsWith('.tar.gz')).length,3);
        const photoArchive=files.find(file=>file.startsWith('photos-'));
        const contents=execFileSync(shell,['-c','exec /usr/bin/tar -tzf "$1"','list',localPath(path.join(backups,photoArchive))],{encoding:'utf8'});
        assert.match(contents,/photo\.jpg/);
      } else {
        assert.deepEqual(files.sort(),['db-old.dump','important.txt']);
      }
    } finally {
      assert.equal(path.dirname(root),process.cwd());
      fs.rmSync(root,{recursive:true,force:true});
    }
  });
}
