import React from "react";
import Area from "../../../../lib/components/area";

export default function AdminLayout() {
  return <div className="container-fluid">
    <div className="admin-navigation">
      <Area id="admin.navigation" noOuter={true} />
    </div>
    <div className="content-wrapper">
      <div className="header">
        <Area id="header" noOuter={true} />
      </div>
      <div className="content">
        <Area id="content" noOuter={true} />
      </div>
      <div className="footer"><div className="copyright"><span>Copyright © 2020 nodejscart Commerce</span></div><div className="version"><span>Version 1.0 dev</span></div></div>
    </div>
    <Area className="content-wrapper" id="admin.content" />
  </div>
}