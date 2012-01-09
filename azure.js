var fs = require("fs");
var uuid = require("node-uuid");
var AzureMgt = require("./azure-management");
var PublishHelper = require("./publish-helper");
var packager = require("./azure-packager-node");
var argumentHandler = require("./argument-handler");

var program = require('commander');

program
    .option('-p, --publish [serviceName]', 'publish the service')
    .option('-c, --cert', 'create X509 cert for the Azure mangement portal')
    .option('-po, --portal', 'opens the Azure management portal')
    .option('-d, --download', 'download publish settings')
    .option('-de, --debug', 'output debug messages')
    .parse(process.argv);

if (program.cert) {
    argumentHandler.createCert(function(err) {
        if (err) {
            console.log(err);
        }
        console.log("copy the *.publishsettings file in your browser's download directory to azure publish tool folder");
    });
}
else if (program.portal) {
    argumentHandler.openPortal(function(err) {
        if (err) {
            console.log(err);
        }
    });
}
else if (program.download) {
    argumentHandler.downloadPublishSettings(function(err) {
        if (err) {
            console.log(err);
        }
    });
}
else if (program.publish) { 
    if (program.publish === true) {
        console.log("error: service name is required");
        return;
    }
        
    var files = fs.readdirSync("./");
    
    //find settings files
    var settingsFiles = files.filter(function(value, index, object) {
        if (value.match(".publishsettings$")==".publishsettings") {
            return true;
        }
    });

    //if not settings file was found then display an error
    if (settingsFiles.length == 0) {
        console.log("publish settings file (.publishsettings) is required. To download use azure -d");
        return;
    }

    //grab the first one
    var settingsFile = settingsFiles[0];
    console.log("using settings file:", settingsFile);

    var azureMgt = new AzureMgt(
                            fs.readFileSync(settingsFile, "ascii"),
                            fs.readFileSync("./certificates/master.cer", "ascii"),
                            fs.readFileSync("./certificates/ca.key", "ascii"),
                            program.debug
                    );
    
    /* // you can update the config of a deployment like this:
    azureMgt.upgradeConfiguration(program.publish, "production", { instanceCount: 2 }, function (reqId) {
        azureMgt.monitorStatus(reqId, function (err) {
            console.log("config update", err);
        });
    });
    */
                    
    var publish = new PublishHelper(azureMgt);
        
    console.log("creating package for './apps/" + program.publish + "'");
    packager("./apps/" + program.publish, "./build_temp/" + uuid.v4(), function (file) {
        console.log("packaged @ " + file);
        
        publish.uploadPackage(file, function (pkg) {
            console.log("package uploaded", pkg);
            
            fs.unlink(file, function () {
                console.log("package removed from filesystem");
            });
            
            // specify the (default) config settings, they will be set if a new deployment is created
            // otherwise use 'upgradeConfiguration([service], [slot], [config], [callback])'
            var defaultConfig = {
                operatingSystem: azureMgt.constants.OS.WIN2008_SP2,
                instanceCount: 1
            };
            
            publish.publishPackage(pkg, program.publish, defaultConfig, function (err) {
                if (err) {
                    console.log("publish error", err);
                }
                else {
                    console.log("publish succeeded");
                }
                
                publish.waitForServiceToBeStarted(program.publish, function (url) {
                    console.log("Service running and available on " + url);
                });
            });
        });
    });
}
else {
    console.log(program.helpInformation());
}