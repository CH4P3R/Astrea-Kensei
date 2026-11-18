# Target spectral characterization

The Compare panel characterizes one fixed sky position: the requested ICRS RA/Dec of reference A. Every loaded observation is queried at that same position. The observation's own cutout center and the terrestrial observer position are not substitutes for this target.

`GET /api/v1/images/{id}/spectral?ra_deg=...&dec_deg=...` returns the calibrated central wavelength and bandwidth of the native detector pixel containing the target. The backend uses the observation's CWAVE/CBAND calibration maps, without spatial interpolation. The frontend validates the response identity, target, pixel coordinates, method and positive finite measurements.

The panel reports wavelength and bandwidth in micrometers and signed wavelength differences relative to A. Bandwidth is not an uncertainty estimate. Matching central wavelengths do not establish identical spectral response profiles or certify a temporal comparison. A sample at one point does not characterize the whole field. Image quality, calibration consistency, spatial alignment, resolution and measurement uncertainty still need independent evaluation.

Unavailable calibration is displayed explicitly and never replaced by a detector's nominal band. Network/response failures have a separate retry action. Spectral loading, absence or failure never gates exploratory playback.

Requests are keyed by cutout ID and target position, limited to three concurrent tasks and canceled when their frame is removed or the panel unmounts. A response from an obsolete task cannot overwrite a replacement. Playback ticks and projection renewals do not re-fetch calibration. A bounded timeout leaves the user able to retry rather than waiting indefinitely.

The scientific rationale is documented by [IRSA's SPHEREx overview](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/overview.html): the instrument's wavelength response varies across each detector. A shared detector alone cannot establish matching wavelengths.

[IRSA's data product documentation](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/) specifically recommends the full CWAVE and CBAND calibration maps for science analysis. The coarse WCS-WAVE lookup table is intended for visualization and is not substituted here. Reading the calibrated native-pixel value avoids introducing another spatial interpolation; it does not remove the instrument's calibration uncertainties.

The resolver searches the observation's own release for a unique calibration with the same declared source identity and exact WCS-WAVE reference table. It also checks the detector, explicit sky orientation and full-image dimensions. The reference table identifies a candidate; the reported measurements come from CWAVE/CBAND. Public version numbers are never inferred from the exposure's pipeline version, and a missing or ambiguous match remains unknown. The original-image pixel indices use the archive's sky orientation, which is not necessarily the raw detector electronics orientation.

This matching strategy is deliberately conservative and is an application-level inference from the file provenance and reference data. It has local fixture coverage; interoperability with representative real archive calibration files still needs direct validation. The attempted live-file check was not completed. It must not be described as an independently validated scientific comparison workflow.

This increment characterizes spectral sampling only. Further work toward reliable temporal measurements must address quality flags and noise, calibration consistency, spatial registration and effective PSFs, uncertainty-aware change measurements, and validation against independently checked real observations and control cases. Saving the input observation identifiers and processing choices is also necessary to reproduce a result. No wavelength-difference threshold is currently presented as a scientific pass/fail criterion.
