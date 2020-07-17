const redis = require('redis');
const Sequelize = require('sequelize');
const should = require('should');
const cacher = require('..');

const opts = {};
opts.database = process.env.DB_NAME || 'sequelize_redis_cache_test';
opts.user = process.env.DB_USER || 'root';
opts.password = process.env.DB_PASS;
opts.dialect = process.env.DB_DIALECT || 'sqlite';
opts.logging = process.env.DB_LOG ? console.log : false;

const redisPort = process.env.REDIS_PORT || 6379;
const redisHost = process.env.REDIS_HOST;

/* global describe */
/* global it */
/* global before */
/* global after */

function onErr(err) {
  throw err;
}

describe('Sequelize-Redis-Cache', () => {
  let rc;
  let db;
  let Entity;
  let Entity2;
  let inst;

  before((done) => {
    rc = redis.createClient(redisPort, redisHost);
    rc.on('error', onErr);
    db = new Sequelize(opts.database, opts.user, opts.password, opts);
    Entity = db.define('entity', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: Sequelize.STRING(255),
    });
    Entity2 = db.define('entity2', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
    });
    Entity2.belongsTo(Entity, { foreignKey: 'entityId' });
    Entity.hasMany(Entity2, { foreignKey: 'entityId' });
    Entity.sync({ force: true })
      .then(() => {
        Entity2.sync({ force: true }).then(() => {
          Entity.create({ name: 'Test Instance' }).then((entity) => {
            inst = entity;
            Entity2.create({ entityId: inst.id }).then(() => done())
              .catch(onErr);
          })
            .catch(onErr);
        })
          .catch(onErr);
      })
      .catch(onErr);
  });

  it('should fetch stuff from database with and without cache', (done) => {
    const query = { where: { createdAt: inst.createdAt } };
    const obj = cacher(db, rc)
      .model('entity')
      .ttl(1);
    return obj.find(query)
      .then((res) => {
        obj.cacheHit.should.equal(false);
        const obj2 = cacher(db, rc)
          .model('entity')
          .ttl(1);
        return obj2.find(query)
          .then((res) => {
            should.exist(res);
            obj2.cacheHit.should.equal(true);
            obj2.clearCache().then(() => done(), onErr);
          }, onErr);
      }, onErr);
  });

  it('should fetch stuff from database with and without cache', (done) => {
    const query = { where: { createdAt: inst.createdAt } };
    const obj = cacher(db, rc)
      .model('entity')
      .ttl(1);
    return obj.findOne(query)
      .then((res) => {
        obj.cacheHit.should.equal(false);
        const obj2 = cacher(db, rc)
          .model('entity')
          .ttl(1);
        return obj2.findOne(query)
          .then((res) => {
            should.exist(res);
            obj2.cacheHit.should.equal(true);
            obj2.clearCache().then(() => done(), onErr);
          }, onErr);
      }, onErr);
  });

  it('should not hit cache if no results', (done) => {
    const obj = cacher(db, rc)
      .model('entity')
      .ttl(1);
    return obj.find({ where: { id: 2 } })
      .then((res) => {
        should.not.exist(res);
        obj.cacheHit.should.equal(false);
        return done();
      }, onErr);
  });

  it('should clear the cache correctly', (done) => {
    const query = { where: { createdAt: inst.createdAt } };
    const obj = cacher(db, rc)
      .model('entity')
      .ttl(1);
    return obj.find(query)
      .then((res) => {
        const key = obj.key();
        obj.clearCache(query)
          .then(() => {
            rc.get(key, (err, res) => {
              should.not.exist(err);
              should.not.exist(res);
              return done();
            });
          }, onErr);
      }, onErr);
  });

  it('should not blow up with circular reference queries (includes)', (done) => {
    const query = { where: { createdAt: inst.createdAt }, include: [Entity2] };
    const obj = cacher(db, rc)
      .model('entity')
      .ttl(1);
    return obj.find(query)
      .then((res) => done(), onErr);
  });

  it('should return a POJO when retrieving from cache and when not', (done) => {
    let obj;
    const query = { where: { createdAt: inst.createdAt } };
    query.include = [Entity2];
    obj = cacher(db, rc)
      .model('entity')
      .ttl(1);
    return obj.find(query)
      .then((res) => {
        res.toString().should.not.equal('[object SequelizeInstance]');
        res.should.have.property('entity2s');
        res.entity2s.should.have.length(1);
        res.entity2s[0].toString().should.not.equal('[object SequelizeInstance]');
        return done();
      }, onErr);
  });

  it('should run a raw query correctly', (done) => {
    const obj = cacher(db, rc)
      .ttl(1);
    return obj.query('SELECT * FROM entities')
      .then((res) => {
        should.exist(res);
        res.should.be.an.Array;
        res.should.have.length(1);
        res[0].should.have.property('id', 1);
        res[0].should.have.property('name', 'Test Instance');
        res[0].should.have.property('createdAt');
        res[0].should.have.property('updatedAt');
        return done();
      });
  });

  it('should findAll correctly', (done) => {
    const query = { where: { createdAt: inst.createdAt } };
    const obj = cacher(db, rc)
      .model('entity')
      .ttl(1);
    return obj.findAll(query)
      .then((res) => {
        should.exist(res);
        res.should.be.an.Array;
        res.should.have.length(1);
        res[0].should.have.property('id');
        return done();
      }, onErr);
  });

  it('should findAndCount correctly', (done) => {
    const query = { where: { createdAt: inst.createdAt } };
    const obj = cacher(db, rc)
      .model('entity')
      .ttl(1);
    return obj.findAndCount(query)
      .then((res) => {
        should.exist(res);
        res.should.have.property('count', 1);
        return done();
      });
  });

  it('should findAndCountAll correctly', (done) => {
    const query = { where: { createdAt: inst.createdAt } };
    const obj = cacher(db, rc)
      .model('entity')
      .ttl(1);
    return obj.findAndCountAll(query)
      .then((res) => {
        should.exist(res);
        res.should.have.property('count', 1);
        return done();
      });
  });

  it('should count correctly', (done) => {
    const obj = cacher(db, rc)
      .model('entity')
      .ttl(1);
    return obj.count()
      .then((res) => {
        should.exist(res);
        res.should.equal(1);
        return done();
      }, onErr);
  });

  it('should sum correctly', (done) => {
    const obj = cacher(db, rc)
      .model('entity')
      .ttl(1);
    return obj.sum('id')
      .then((res) => {
        should.exist(res);
        res.should.equal(1);
        return done();
      }, onErr);
  });

  it('should max correctly', (done) => {
    const obj = cacher(db, rc)
      .model('entity')
      .ttl(1);
    return obj.max('id')
      .then((res) => {
        should.exist(res);
        res.should.equal(1);
        return done();
      }, onErr);
  });

  it('should min correctly', (done) => {
    const obj = cacher(db, rc)
      .model('entity')
      .ttl(1);
    return obj.min('id')
      .then((res) => {
        should.exist(res);
        res.should.equal(1);
        return done();
      }, onErr);
  });
});
