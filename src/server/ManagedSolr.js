//------------------------------------------------------------------------------------
// install/start/stop solr installation/instance
// v8.4.0 is the latest version that doesn't completely shoot itself in the foot with
// security features (fixes available for 9, but neither is 8 released nor have the fixes been backported)
// https://issues.apache.org/jira/browse/SOLR-15161

const dlcache = require('dlcache')
const os = require('os');
const fs = require('fs');
const path = require('path');
const commandExists = require('command-exists');
const javahome = require('find-java-home');
const child_process = require('child_process');
const waitOn = require('wait-on');
const async = require("async");
const extract = require('extract-zip')
const solrUtils = require('./SolrUtils')

const managedSolrVersion = "8.8.2"
const managedSolrDlUrl = new URL(`https://archive.apache.org/dist/lucene/solr/${managedSolrVersion}/solr-${managedSolrVersion}.zip`)
const managedSolrSha512 = 'd7f1b381bceef17436053e42e3289857b670efba6060ffd3c99757c7df37a55cca89506937935ac34778c76b1cfe8984aba2c2ef76783a7837a25d2ee25ace55'
const managedSolrCmdScript = os.platform() == 'win32' ? "solr.cmd" : "./solr";
const managedSolrEnv = process.env;

var managedSolrPath
var managedSolrSetupDoneFlag
var managedSolrBinPath
var managedSolrUrl
var verbose
var managedSolrClient

/**
 * 
 * @param {URL} solrUrl 
 * @param {boolean} _verbose 
 * @param {async.AsyncResultArrayCallback<any, Error>} cb 
 */
function init(solrPath=null, solrUrl=null, _verbose=false, cb) {
    if (!solrPath) {
        cb(Error("no solrPath set"))
        return
    }
    managedSolrPath = solrPath
    managedSolrSetupDoneFlag = path.join(managedSolrPath, ".setup_complete")
    managedSolrBinPath = path.join(managedSolrPath, "bin")
    managedSolrUrl = new URL(solrUrl.toString())
    verbose = _verbose
    managedSolrClient = undefined

    // this saves quite a bit of memory if using (open)java runtime 12+
    managedSolrEnv.SOLR_JAVA_MEM="-Xms16m -Xmx512m -XX:G1PeriodicGCInterval=300000 -XX:MaxHeapFreeRatio=5 -XX:MinHeapFreeRatio=1"

    var execStack = []
    execStack.push(managedSolrAdjustEnv);
    execStack.push(managedSolrStop);
    execStack.push(managedSolrInstall);
    execStack.push(managedSolrPostInstall);
    execStack.push(managedSolrStart);
    execStack.push(managedSolrCreateClient);
    execStack.push(managedSolrSetup);
    execStack.push(managedSolrWaitForCore);
    execStack.push(managedSolrSetup2);
    async.series(execStack, function(err){
        if(err) {
            cb(err)
        } else {
            cb()
        }
    });
}

/** @param {NodeJS.ProcessEnv} env @returns {void} */
function reorder_cygwin_paths(env) {
    var p = env.PATH.split(";")
    var p1 = [];
    var p2 = [];
    p.forEach(function(_p){
        if (_p.match(/cygwin.*\\bin/i)) {
            p2.push(_p);
        } else {
            p1.push(_p);
        }
    });
    p2.forEach(function(_p){
        p1.push(_p);
    });
    env.PATH = p1.join(";");
}

function managedSolrAdjustEnv(cb) {
    if (os.platform() == 'win32' && process.env.JAVA_HOME && process.env.JAVA_HOME.startsWith('/')) {
        console.log("trying to fix JAVA_HOME")
        if (commandExists.sync('cygpath')) {
            // because we are running under cygwin, we need to reorder the paths so that the windows paths come first
            // and cygwin's find.exe does not shadow win32's.
            reorder_cygwin_paths(managedSolrEnv);

            process.env.JAVA_HOME = undefined
            javahome(function(err, home){
                if(err) {
                    cb(err)
                } else {
                    console.log("found JAVA_HOME: " + home);
                    process.env.JAVA_HOME = home
                    cb()
                }
            });
            return;

            // var jh = child_process.spawnSync('cygpath', ['-w', process.env.JAVA_HOME]).stdout.toString()
            // console.log("using JAVA_HOME=" + jh)
            // managedSolrEnv.JAVA_HOME = jh;

        }
    }
    cb()
}

function getRootUrl() {
    var _url = new URL(managedSolrUrl)
    _url.search = ''
    _url.hash = ''
    _url.pathname = ''
    return _url.toString()
}

function managedSolrStop(cb) {
    if (fs.existsSync(managedSolrSetupDoneFlag) || !fs.existsSync(path.join(managedSolrBinPath, managedSolrCmdScript))) {
        cb();
        return;
    }
    console.log("Checking for a running instance...")

    /** @type {waitOn.WaitOnOptions} */
    waitOn({resources: [getRootUrl()], timeout: 30000, reverse: true}).then(function() {
        console.log("Stopping Solr...")
        try {
            var cmd = managedSolrCmdScript + " stop -p " + parseInt(managedSolrUrl.port)
            if (verbose) {
                console.log("executing command: " + cmd)
            }
            child_process.execSync(cmd, {cwd: managedSolrBinPath, env: managedSolrEnv});
        } catch (err) {
            console.log("failed to stop instance, let's hope we can continue anyways...")
        }
        cb()
    }).catch(function(err) {
        cb(err)
    });
}

function managedSolrInstall(cb) {
    if (fs.existsSync(managedSolrSetupDoneFlag)) {
        cb();
        return;
    }
    console.log("Unpacking solr to: " + managedSolrPath)
    if (fs.existsSync(managedSolrPath)) {
        fs.rmSync(managedSolrPath, {recursive: true, maxRetries: 10, retryDelay: 1000, force: true})
    }
    const tmpd = path.join(__dirname, ".unpack_tmp");
    if (fs.existsSync(tmpd)) {
        fs.rmSync(tmpd, {recursive: true, maxRetries: 10, retryDelay: 1000, force: true})
    }
    dlcache.dl(managedSolrDlUrl, {sha512: managedSolrSha512}).then(function(zipfile) {
        extract(zipfile, { dir: tmpd }).then(function() {
            fs.renameSync(path.join(tmpd, "solr-" + managedSolrVersion), managedSolrPath)
            fs.rmSync(tmpd, {recursive: true, maxRetries: 10, retryDelay: 1000, force: true})
            cb()
        }, function(err) {
            cb(new Error(err))
        })
    }, function(err) {
        cb(new Error(err))
    })
}

function managedSolrPostInstall(cb) {
    if (fs.existsSync(managedSolrSetupDoneFlag)) {
        cb();
        return;
    }

    const jettyXml = path.join(managedSolrPath, "server", "etc", "jetty.xml")
    var xml = fs.readFileSync(jettyXml).toString()

    // if(false) {
    //     var scriptSrc = `http://${argv.servername}:${argv.serverport}`
    //     console.log("Adding " + scriptSrc + " to script-src in: " + jettyXml)
    //     xml = xml.replace(/(script-src 'self')/, `script-src ${scriptSrc} 'self'`)
    // }

    console.log("Removing X-Content-Type-Options header, you have been warned!")
    xml = xml.replace(/X-Content-Type-Options/, `X-GTFO`)

    fs.writeFileSync(jettyXml, xml)

    //build/solr/server/solr-webapp/webapp/WEB-INF/web.xml
    /**
    <filter>
    <filter-name>cross-origin</filter-name>
    <filter-class>org.eclipse.jetty.servlets.CrossOriginFilter</filter-class>
</filter>
<filter-mapping>
    <filter-name>cross-origin</filter-name>
    <url-pattern>/*</url-pattern>
</filter-mapping>
 */
    //cp build/solr/server/lib/jetty-servlets-9.4.34.v20201102.jar build/solr/server/solr-webapp/webapp/WEB-INF/lib/
    //build/solr/server/solr/configsets/_default/conf/solrconfig.xml

    cb()
}

function managedSolrStart(cb) {
    console.log("Starting Solr...")
    var cmd = `${managedSolrCmdScript} start -f -p ${managedSolrUrl.port} -h ${managedSolrUrl.hostname}`
    if (verbose) {
        console.log("executing command: " + cmd)
    }
    // on windows the solr start command does not properly detach, so we have to keep the process attached
    // or kill the server instantly
    child_process.spawn(cmd, {cwd: managedSolrBinPath, env: managedSolrEnv, stdio: 'inherit', shell: true});
    waitOn({resources: [getRootUrl()], timeout: 30000}).then(function() {
        cb()
    }).catch(function(err) {
        cb(err)
    });
}

function managedSolrSetup(cb) {
    if (fs.existsSync(managedSolrSetupDoneFlag)) {
        cb();
        return;
    }
    const solrCoreName = solrUtils.extractSolrCoreName(managedSolrUrl)
    var cmd = `${managedSolrCmdScript} create_core -c ${solrCoreName} -p ${managedSolrUrl.port}`
    if (verbose) {
        console.log("executing command: " + cmd)
    }
    child_process.execSync(cmd, {cwd: managedSolrBinPath, env: managedSolrEnv});
    cb()
}

function managedSolrCreateClient(cb) {
    if (verbose) {
        console.log("creating solr client")
    }

    managedSolrClient = solrUtils.createClientFromUrl(managedSolrUrl)
    cb()
}

function managedSolrWaitForCore(cb) {
    if (verbose) {
        console.log("waiting for service")
    }
    async.retry({times: 30, interval: 1000}, function(cb2) {
        managedSolrClient.ping(function(err,obj){
            if(err){
                cb2(err)
            }else{
                console.log("ping OK")
                cb2()
            }
        });
    }, function(err, result) {
        if(err) {cb("service ping failed: "+err)} else {cb()}
    });
}

function managedSolrSetup2(cb) {
    if (fs.existsSync(managedSolrSetupDoneFlag)) {
        cb();
        return;
    }

    // we are using dynamic configuration. So whatever data we throw at Solr, the first instance it sees for a particular
    // field, that's the type it will assume for that field henceforth. If our first submission would be "123" as the body
    // of a note, the type would be a number. For that reason we are now implicitly forcing the desired field types by
    // submitting a proper example note
    /** @type {INote} */
    var note = {
        id: "20200101T202020.txt",
        text: "some proper English\nmulti-line\ntext.",
        created_dt: new Date().toISOString(),
        lmod_dt: new Date().toISOString(),
    }
    async.series([
        function(cb2) {
            managedSolrClient.add(note, function(err,obj) {
                if(err) {cb2(err)} else {cb2()}
            })
        },
        function(cb2) {
            managedSolrClient.softCommit(function(err,obj) {
                if(err) {cb2(err)} else {cb2()}
            })
        },
        function(cb2) {
            managedSolrClient.deleteAll(function(err,obj) {
                if(err) {cb2(err)} else {cb2()}
            })
        },
        function(cb2) {
            managedSolrClient.softCommit(function(err,obj) {
                if(err) {cb2(err)} else {cb2()}
            })
        },
    ],
    function(err,result) {
        if(err) {cb(err)}
        else {
            fs.writeFileSync(managedSolrSetupDoneFlag, "")
            console.log("Solr setup finished.")
            cb()
        }
    })
}



exports.init = init

